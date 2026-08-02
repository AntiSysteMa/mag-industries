// Recepción de leads del formulario web.
//
// Sustituye al POST directo del navegador contra /rest/v1/leads. Aquel camino
// exigía que `anon` tuviera privilegio de INSERT, y con la clave publicable a
// la vista en app.js cualquiera podía inundar la tabla: los CHECK acotan el
// tamaño de cada fila, pero nada limitaba cuántas.
//
// Aquí el INSERT lo hace la service_role, que nunca sale del servidor, y antes
// de llegar a la base de datos cada petición pasa por:
//   1. lista blanca de origen        (fricción para el uso desde otras webs)
//   2. límite de tamaño del cuerpo   (antes de parsear nada)
//   3. honeypot _gotcha              (ahora en servidor, no solo en el navegador)
//   4. validación de campos          (longitudes y formato de email)
//   5. rate limiting por IP          (5/hora y 15/día, IP guardada como HMAC)
//
// Un rechazo aquí NO pierde el contacto: app.js envía en paralelo el aviso por
// email vía FormSubmit, que es un camino independiente.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ORIGENES_PERMITIDOS = new Set([
  "https://www.magindustries.es",
  "https://magindustries.es",
]);

// Ventanas de limitación por IP. La primera que se supere corta la petición.
const VENTANAS = [
  { ttl: "1 hour", max: 5 },
  { ttl: "24 hours", max: 15 },
];

// Espejo exacto de los CHECK de la tabla `leads`. Si cambian allí, cambian aquí.
const LIMITES: Record<string, number> = {
  nombre: 120,
  empresa: 160,
  email: 254,
  telefono: 40,
  maquinas: 160,
  inactividad: 160,
  detalles: 4000,
  origen: 160,
};

const RE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_CUERPO = 16 * 1024; // 16 KB: muy por encima de un formulario legítimo

function cors(origin: string | null): Record<string, string> {
  const permitido = origin && ORIGENES_PERMITIDOS.has(origin) ? origin : "https://www.magindustries.es";
  return {
    "Access-Control-Allow-Origin": permitido,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function responder(estado: number, cuerpo: unknown, origin: string | null): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { ...cors(origin), "Content-Type": "application/json" },
  });
}

// La IP es dato personal: se guarda solo su HMAC, y la clave del HMAC
// (service_role) nunca sale del servidor. No se puede revertir a la IP.
async function huellaIp(ip: string): Promise<string> {
  const clave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SERVICE_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const firma = await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(firma))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

async function supabase(ruta: string, init: RequestInit): Promise<Response> {
  return await fetch(`${SUPABASE_URL}${ruta}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

/** Recorta a la longitud máxima y normaliza espacios. Devuelve null si queda vacío. */
function limpiar(valor: unknown, campo: string): string | null {
  if (typeof valor !== "string") return null;
  const t = valor.trim().slice(0, LIMITES[campo]);
  return t.length ? t : null;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors(origin) });
  }
  if (req.method !== "POST") {
    return responder(405, { error: "metodo_no_permitido" }, origin);
  }

  // Un navegador siempre manda Origin. Que falte no es prueba de nada (curl no
  // lo envía), pero si viene y no está en la lista, se corta aquí.
  if (origin && !ORIGENES_PERMITIDOS.has(origin)) {
    return responder(403, { error: "origen_no_permitido" }, origin);
  }

  const declarado = Number(req.headers.get("content-length") ?? "0");
  if (declarado > MAX_CUERPO) {
    return responder(413, { error: "cuerpo_demasiado_grande" }, origin);
  }

  const crudo = await req.text();
  if (crudo.length > MAX_CUERPO) {
    return responder(413, { error: "cuerpo_demasiado_grande" }, origin);
  }

  let datos: Record<string, unknown>;
  try {
    datos = JSON.parse(crudo);
    if (typeof datos !== "object" || datos === null || Array.isArray(datos)) throw new Error();
  } catch {
    return responder(400, { error: "json_invalido" }, origin);
  }

  // Honeypot. Un humano nunca rellena este campo porque no lo ve. Se responde
  // "ok" a propósito: si el bot recibiera un error, reintentaría variando.
  const trampa = datos._gotcha;
  if (typeof trampa === "string" && trampa.trim().length > 0) {
    return responder(200, { ok: true }, origin);
  }

  const fila: Record<string, string | null> = {};
  for (const campo of Object.keys(LIMITES)) fila[campo] = limpiar(datos[campo], campo);

  if (!fila.nombre) return responder(400, { error: "falta_nombre" }, origin);
  if (!fila.email || !RE_EMAIL.test(fila.email)) {
    return responder(400, { error: "email_invalido" }, origin);
  }

  const ip = (req.headers.get("x-forwarded-for") ?? "desconocida").split(",")[0].trim();
  const huella = await huellaIp(ip);

  try {
    for (const { ttl, max } of VENTANAS) {
      const r = await supabase("/rest/v1/rpc/bump_rate", {
        method: "POST",
        body: JSON.stringify({ p_bucket: `${huella}:${ttl}`, p_ttl: ttl }),
      });
      if (!r.ok) throw new Error(`bump_rate ${r.status}`);
      const golpes = Number(await r.json());
      if (golpes > max) {
        return responder(
          429,
          { error: "demasiadas_solicitudes", reintentar_en: ttl },
          origin,
        );
      }
    }
  } catch (e) {
    // Si el contador falla no se bloquea al usuario legítimo: se registra y se
    // sigue. Perder un lead real es peor que aceptar uno de más.
    console.error("rate limit no disponible:", e instanceof Error ? e.message : e);
  }

  const ins = await supabase("/rest/v1/leads", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(fila),
  });

  if (!ins.ok) {
    // El detalle de Postgres no se devuelve al cliente: revelaría el esquema.
    console.error("insert fallido:", ins.status, await ins.text());
    return responder(422, { error: "no_registrado" }, origin);
  }

  return responder(201, { ok: true }, origin);
});
