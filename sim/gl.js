/* Render WebGL2 de las pantallas de simulación: un único contexto por página (el «hub») en un lienzo fuera del DOM,
   que pinta cada escena visible y la copia con drawImage a su lienzo 2D. Las escenas no reciben el contexto: solo
   la API de SceneGL (terreno Z-map, herramienta, mallas, líneas, vectores, cámara, frame, project).

   Convención de cámara: az es el azimut de la POSICIÓN de la cámara, medido desde +X hacia +Y (az −45 = cámara en
   +X−Y); el es la elevación sobre el plano XY. Z hacia arriba, triedro dextrógiro, milímetros de pieza. */
(function (G) {
'use strict';
const C = G.CamSim || (G.CamSim = {}), D = G.document;
if (!D || (C.GL && C.GL.hub)) return;

const P = {};
try { new URLSearchParams(G.location.search).forEach((v, k) => { if (k.indexOf('sim') === 0) P[k.slice(3)] = v; }); } catch (e) {}
if (G.CamSimParams) Object.assign(P, G.CamSimParams);

const PI = Math.PI, RAD = PI / 180, now = () => G.performance.now();
const SOFT = /SwiftShader|llvmpipe|softpipe|Software|Basic Render|Microsoft Basic/i;
const hex3 = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
const lin = h => hex3(h).map(v => Math.pow(v, 2.2));
const mixHex = (a, b, k) => { const x = hex3(a), y = hex3(b); return x.map((v, i) => Math.pow(v + (y[i] - v) * k, 2.2)); };
const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const PAL = C.PAL || {};
const L1 = norm([-0.55, -0.35, 0.76]), L2 = norm([0.6, 0.5, 0.4]);

/* ---------- álgebra sin asignaciones (mat4 column-major, como GL) ---------- */
function mul4(o, a, b) {
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b0 + a[4 + r] * b1 + a[8 + r] * b2 + a[12 + r] * b3;
  }
  return o;
}
function lookAt(o, e, c, u) {
  let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2], l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
  let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx; l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0; o[4] = xy; o[5] = yy; o[6] = zy; o[7] = 0; o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
  o[12] = -(xx * e[0] + xy * e[1] + xz * e[2]); o[13] = -(yx * e[0] + yy * e[1] + yz * e[2]); o[14] = -(zx * e[0] + zy * e[1] + zz * e[2]); o[15] = 1;
  return o;
}
function ortho(o, l, r, b, t, n, f) {
  o.fill(0); o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = -2 / (f - n);
  o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -(f + n) / (f - n); o[15] = 1; return o;
}
function frustum(o, l, r, b, t, n, f) {
  o.fill(0); o[0] = 2 * n / (r - l); o[5] = 2 * n / (t - b); o[8] = (r + l) / (r - l); o[9] = (t + b) / (t - b);
  o[10] = -(f + n) / (f - n); o[11] = -1; o[14] = -2 * f * n / (f - n); return o;
}
const xfv = (m, x, y, z, o) => { o[0] = m[0] * x + m[4] * y + m[8] * z + m[12]; o[1] = m[1] * x + m[5] * y + m[9] * z + m[13]; o[2] = m[2] * x + m[6] * y + m[10] * z + m[14]; o[3] = m[3] * x + m[7] * y + m[11] * z + m[15]; return o; };
const IDM = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
/* matriz de modelo: punta en pos y eje +Z local llevado a axis */
function poseTo(o, pos, ax) {
  let zx = 0, zy = 0, zz = 1;
  if (ax) { const l = Math.hypot(ax[0], ax[1], ax[2]) || 1; zx = ax[0] / l; zy = ax[1] / l; zz = ax[2] / l; }
  /* x = r × z con r = Z o, cerca del polo, X */
  let xx, xy, xz;
  if (Math.abs(zz) < 0.9) { xx = -zy; xy = zx; xz = 0; } else { xx = 0; xy = -zz; xz = zy; }
  const l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
  o[0] = xx; o[1] = xy; o[2] = xz; o[3] = 0; o[4] = zy * xz - zz * xy; o[5] = zz * xx - zx * xz; o[6] = zx * xy - zy * xx; o[7] = 0;
  o[8] = zx; o[9] = zy; o[10] = zz; o[11] = 0; o[12] = pos[0]; o[13] = pos[1]; o[14] = pos[2]; o[15] = 1;
  return o;
}

/* ---------- GLSL ---------- */
const HEAD = '#version 300 es\nprecision highp float; precision highp int;\n';
const COMMON = `
uniform vec3 uL; uniform vec3 uL2; uniform vec4 uEye;
vec3 viewDir(vec3 P){ return uEye.w>.5 ? normalize(uEye.xyz-P) : uEye.xyz; }
vec3 env(vec3 r){
  vec3 c=mix(vec3(.05,.055,.06),vec3(.11,.125,.14),smoothstep(-.3,.2,r.z));
  c+=vec3(.06)*smoothstep(-.9,-.5,r.z)*(1.-smoothstep(-.5,-.2,r.z));
  c=mix(c,vec3(.22,.25,.28),smoothstep(.25,1.,r.z));
  c+=vec3(1.2,1.17,1.13)*smoothstep(.955,.985,dot(r,normalize(vec3(-.35,.3,.89))));
  c+=vec3(.5,.44,.3)*smoothstep(.90,.97,dot(r,normalize(vec3(.75,-.15,.64))));
  return c;
}
vec3 shade(vec3 N,vec3 V,vec3 base,float metal,float gloss,vec3 T,float an,float ao,float sh){
  vec3 F0=mix(vec3(.04),base,metal), dif=base*(1.-metal);
  vec3 H=normalize(uL+V); float nl=max(dot(N,uL),0.),nh=max(dot(N,H),0.),nv=max(dot(N,V),1e-3);
  float p=exp2(gloss*10.+1.), sp=pow(nh,p)*(p+8.)/25.;
  vec3 B=vec3(0.);
  if(an>0.){ vec3 t=T-N*dot(N,T); t=t/max(length(t),1e-4); B=cross(N,t);
    float th=dot(t,H), pa=p*.35; sp=mix(sp,pow(sqrt(max(0.,1.-th*th)),pa)*(pa+8.)/25.*.7,an); }
  vec3 Fr=F0+(1.-F0)*pow(1.-nv,5.);
  vec3 col=(dif*nl+F0*sp*nl)*1.6*sh+dif*max(dot(N,uL2),0.)*.35;
  vec3 e=env(reflect(-V,N));
#ifndef CHEAP
  if(an>0.) e=(e+env(reflect(-V,normalize(N+B*.18)))+env(reflect(-V,normalize(N-B*.18)))+env(reflect(-V,normalize(N+B*.4)))+env(reflect(-V,normalize(N-B*.4))))*.2;
#endif
  return col+Fr*e*ao*(.55+.45*sh)+dif*vec3(.10,.12,.14)*ao;
}
vec3 tonemap(vec3 c){ c=c*(2.51*c+.03)/(c*(2.43*c+.59)+.14); return pow(clamp(c,0.,1.),vec3(1./2.2)); }
#ifdef CHEAP
float vnoise(vec2 p){ return .5; }
float anoise(vec2 p){ return .5; }
#else
float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
/* ruido que se apaga a su media cuando su periodo baja de ~2 px: sin muaré en caras lejanas ni a DPR 1 */
float anoise(vec2 p){ vec2 w=fwidth(p); return mix(.5,vnoise(p),1.-smoothstep(.35,.9,max(w.x,w.y))); }
#endif
uniform vec4 uCapA[3]; uniform vec3 uCapB[3];
/* sombra de la herramienta: rayo hacia la luz contra tres cápsulas a lo largo de su eje, penumbra creciente */
float capSh(vec3 P,vec4 A,vec3 Bp){
  vec3 d=Bp-A.xyz,w=P-A.xyz; float b=dot(uL,d),c=dot(d,d),e=dot(d,w),q=dot(uL,w),den=c-b*b;
  float s=den>1e-5?clamp((e-b*q)/den,0.,1.):0., t=b*s-q; if(t<=0.) return 1.;
  s=clamp(dot(P+uL*t-A.xyz,d)/max(c,1e-5),0.,1.);
  float r=length(P+uL*t-A.xyz-d*s), pen=.25+.035*t;
  return 1.-.8*(1.-smoothstep(A.w-pen,A.w+pen,r));
}
float toolShadow(vec3 P){ float s=1.; for(int i=0;i<3;i++) if(uCapA[i].w>0.) s=min(s,capSh(P,uCapA[i],uCapB[i])); return s; }
`;
const HEIGHT = `
uniform highp sampler2D uH; uniform ivec2 uN; uniform vec2 uS;
float Hc(ivec2 c){ return texelFetch(uH,clamp(c,ivec2(0),uN-1),0).r; }
`;
const SRC = {
  ter: [HEAD + `uniform mat4 uVP; uniform vec2 uO; uniform float uBot; uniform int uSide; uniform int uK; uniform highp sampler2D uD; uniform vec4 uSec;
${HEIGHT}
out vec3 vP; out vec3 vN; out vec2 vAS; out vec2 vC; flat out int vSide;
vec2 XY(ivec2 c){ vec2 p=(vec2(c)+.5)*uS/vec2(uN);
  if(c.x<=0)p.x=0.; if(c.x>=uN.x-1)p.x=uS.x; if(c.y<=0)p.y=0.; if(c.y>=uN.y-1)p.y=uS.y; return p; }
void main(){
  ivec2 c; float z; vec3 n; vec2 xy; vSide=uSide; vAS=vec2(1.);
  if(uSide==0){ int gx=(uN.x+uK-2)/uK+1; c=min(ivec2(gl_VertexID%gx,gl_VertexID/gx)*uK,uN-1); z=Hc(c); xy=XY(c);
    vec4 d=texelFetch(uD,c,0); vAS=d.rg; vec2 q=d.ba*2.-1.; n=vec3(q,sqrt(max(0.,1.-dot(q,q)))); }
  else { int k=gl_VertexID/2; bool bot=(gl_VertexID%2)==1; vec2 cs=uS/vec2(uN);
    if(uSide==5){
      if(uSec.x<1.5){ float f=(uSec.y-uO.x)/cs.x-.5; int i=int(floor(f)); c=ivec2(i,k);
        z=mix(Hc(c),Hc(c+ivec2(1,0)),clamp(f-float(i),0.,1.)); xy=vec2(uSec.y-uO.x,XY(ivec2(0,k)).y); n=vec3(-uSec.z,0,0); }
      else { float f=(uSec.y-uO.y)/cs.y-.5; int j=int(floor(f)); c=ivec2(k,j);
        z=mix(Hc(c),Hc(c+ivec2(0,1)),clamp(f-float(j),0.,1.)); xy=vec2(XY(ivec2(k,0)).x,uSec.y-uO.y); n=vec3(0,-uSec.z,0); }
    } else {
      if(uSide==1){c=ivec2(k,0);n=vec3(0,-1,0);} else if(uSide==2){c=ivec2(uN.x-1,k);n=vec3(1,0,0);}
      else if(uSide==3){c=ivec2(k,uN.y-1);n=vec3(0,1,0);} else {c=ivec2(0,k);n=vec3(-1,0,0);}
      z=Hc(c); xy=XY(c);
    }
    if(bot) z=uBot;
  }
  vP=vec3(xy+uO,z); vN=n; vC=vec2(c);
  gl_Position=uVP*vec4(vP,1.);
}`, HEAD + `uniform highp sampler2D uA; uniform highp sampler2D uM; uniform int uMode; uniform int uRaw; uniform float uMarks; uniform float uFade;
uniform float uHatch; uniform vec3 uCol[8]; uniform vec3 uCut; uniform vec3 uCmp[3]; uniform vec2 uTol; uniform vec4 uSec; uniform highp sampler2D uD;
${COMMON}${HEIGHT}
in vec3 vP; in vec3 vN; in vec2 vAS; in vec2 vC; flat in int vSide; out vec4 o;
void main(){
  if(uSec.x>.5&&vSide!=5){ float d=(uSec.x<1.5?vP.x:vP.y)-uSec.y; if(d*uSec.z<-1e-3) discard; }
  vec3 N0=normalize(vN); vec2 AS=vAS;
#ifdef CHEAP
  /* con la rejilla diezmada la geometría solo da la silueta: normal, AO y sombra se leen por celda */
  /* en paredes manda la faceta: la normal muestreada de una celda de pared sobre una rampa de dos celdas da dientes */
  if(vSide==0){ vec4 d=texture(uD,(vC+.5)/vec2(uN)); vec2 q=d.ba*2.-1.;
    vec3 nf=normalize(cross(dFdx(vP),dFdy(vP))); nf*=sign(nf.z+1e-6); float w=smoothstep(.55,.85,nf.z);
    N0=normalize(mix(nf,vec3(q,sqrt(max(0.,1.-dot(q,q)))),w)); AS=mix(vAS,d.rg,w); }
#endif
  vec3 N=N0, V=viewDir(vP), base, T=vec3(1,0,0); float metal,gloss,an=0.;
  float g=vnoise(vP.xy*2.3)*.6+anoise(vP.xy*9.)*.4;
  vec2 fc=clamp(vC,vec2(0),vec2(uN-1)); float raw=0.;
  if(vSide==5){
    base=uCut*(.96+.06*g); metal=.3; gloss=.3;
    if(fract((gl_FragCoord.x+gl_FragCoord.y)/uHatch)<.24) base*=.42;
  } else if(vSide!=0){
    /* lateral del bruto: mate con marcas finas horizontales */
    float s=abs(N.x)>.5?vP.y:vP.x, kz=1.-smoothstep(.35,.9,fwidth(vP.z)*1.8);
    base=uCol[0]*(.95+.08*anoise(vec2(s*.15,vP.z*7.)))*(1.+.06*kz*sin(vP.z*11.+vnoise(vec2(s*.4,vP.z))*2.)); metal=.45; gloss=.3; an=.3;
    T=normalize(vec3(-N.y,N.x,0.)); raw=1.;
  } else {
#ifdef CHEAP
    ivec2 c0=ivec2(fc+.5); vec4 w=vec4(1,0,0,0); const int NK=1;
#else
    ivec2 c0=ivec2(floor(fc)); vec2 f=fc-vec2(c0); vec4 w=vec4((1.-f.x)*(1.-f.y),f.x*(1.-f.y),(1.-f.x)*f.y,f.x*f.y); const int NK=4;
#endif
    base=vec3(0.); metal=0.; gloss=0.;
    for(int k=0;k<NK;k++){ ivec2 q=min(c0+ivec2(k&1,k>>1),uN-1); int id=int(texelFetch(uA,q,0).r*255.+.5);
      if(id==0){ base+=uCol[0]*w[k]; metal+=.45*w[k]; gloss+=.32*w[k]; an+=(uRaw==2?0.:.22)*w[k]; raw+=w[k]; }
      else { base+=uCol[id&7]*w[k]; metal+=.72*w[k]; gloss+=.5*w[k]; an+=.35*w[k]; } }
    if(raw>.5){
      base*= uRaw==1 ? .9+.2*anoise(vec2(vP.x*.05,vP.y*2.6)) : (.95+.08*g)*(.97+.05*anoise(vec2(vP.x*.15,vP.y*14.)));
      if(N.z>.75) T=vec3(1,0,0);
    } else base*=.975+.045*g;
    vec2 d2=texture(uA,(fc+.5)/vec2(uN)).gb*2.-1.;
    if(raw<=.5&&N.z>.75&&dot(d2,d2)>.01){ float th=.5*atan(d2.y,d2.x); T=vec3(cos(th),sin(th),0.); an*=smoothstep(.75,.95,N.z)*min(1.,length(d2)*1.5); }
    else if(N.z<=.75){ T=normalize(vec3(-N.y,N.x,0.)+vec3(1e-4,0,0)); N=normalize(N+vec3(0,0,sin(vP.z*7.)*uMarks*.04)); }
  }
  float sh=min(AS.y,toolShadow(vP)), ao=AS.x;
  vec3 col=tonemap(shade(N,V,base,metal,gloss,T,an,ao,sh));
  if(uMode==1&&vSide==0){ ivec2 c=ivec2(fc+.5); float dv=(Hc(c)-texelFetch(uM,c,0).r)*N0.z;
    if(!(raw>.5&&abs(dv)<uTol.x)){ vec3 k=dv<-uTol.x?uCmp[2]:dv>uTol.y?uCmp[0]:uCmp[1];
      col=mix(col,k*(.55+.45*max(dot(N0,uL),0.))*(.6+.4*sh),.7*uFade); } }
  o=vec4(col,1.);
}`],
  bake: [HEAD + 'void main(){ vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2); gl_Position=vec4(p*2.-1.,0.,1.); }',
    HEAD + `uniform vec3 uL;
${HEIGHT}
out vec4 o;
void main(){
  ivec2 c=ivec2(gl_FragCoord.xy); vec2 cs=uS/vec2(uN); float h=Hc(c);
  float gx=((Hc(c+ivec2(1,-1))+2.*Hc(c+ivec2(1,0))+Hc(c+ivec2(1,1)))-(Hc(c+ivec2(-1,-1))+2.*Hc(c+ivec2(-1,0))+Hc(c+ivec2(-1,1))))/(8.*cs.x);
  float gy=((Hc(c+ivec2(-1,1))+2.*Hc(c+ivec2(0,1))+Hc(c+ivec2(1,1)))-(Hc(c+ivec2(-1,-1))+2.*Hc(c+ivec2(0,-1))+Hc(c+ivec2(1,-1))))/(8.*cs.y);
  vec3 n=normalize(vec3(-gx,-gy,1.)); float occ=0.;
  for(int k=0;k<8;k++){ float a=float(k)*.7853982+.39; vec2 d=vec2(cos(a),sin(a));
    occ+=clamp((Hc(c+ivec2(round(d*1.2/cs)))-h)/1.2,0.,1.)*.6+clamp((Hc(c+ivec2(round(d*3.2/cs)))-h)/3.2,0.,1.)*.4; }
  vec2 ld=normalize(uL.xy); float te=uL.z/length(uL.xy), sh=1.; vec2 p0=vec2(c)+.5;
  for(int i=1;i<=22;i++){ float t=float(i)*float(i)*.045+float(i)*.35; vec2 q=p0+ld*t/cs;
    if(q.x<0.||q.y<0.||q.x>=float(uN.x)||q.y>=float(uN.y)) break;
    sh=min(sh,clamp(.5+(h+t*te-texelFetch(uH,ivec2(q),0).r)/(.06*t+.12),0.,1.)); }
  o=vec4(1.-.85*occ/8.,sh,n.xy*.5+.5);
}`],
  tool: [HEAD + `layout(location=0) in vec3 aP; layout(location=1) in vec3 aN; layout(location=2) in vec3 aA;
uniform mat4 uVP; uniform mat4 uMdl; out vec3 vP; out vec3 vN; out vec3 vA;
void main(){ vP=(uMdl*vec4(aP,1.)).xyz; vN=mat3(uMdl)*aN; vA=aA; gl_Position=uVP*vec4(vP,1.); }`,
    HEAD + `uniform float uSpin; uniform float uFl; uniform float uLead; uniform float uAlpha; uniform float uItem; uniform vec3 uAx;
uniform vec3 uCoat; uniform vec3 uShank; uniform vec3 uHold; uniform vec3 uFlg;
${COMMON}
in vec3 vP; in vec3 vN; in vec3 vA; out vec4 o;
void main(){
  int part=int(vA.x+.5); vec3 N=normalize(vN), V=viewDir(vP), base; float metal=1.,gloss,an=0.,al=1.;
  if(part==0){
    base=uCoat; gloss=.6; metal=.65;
    float ph=fract((vA.y/6.2831853+vA.z/uLead)*uFl);
    float pat=1.-.75*smoothstep(.52,.6,ph)*(1.-smoothstep(.9,.98,ph))+.6*(smoothstep(.96,1.,ph)+1.-smoothstep(0.,.04,ph));
    base*=mix(pat,.8,uSpin); an=uSpin*.9; if(dot(N,uAx)<-.5) an=0.;
  } else if(part<=2){ base=uShank; gloss=.82; an=.7; }
  else if(part==4){ base=uHold; gloss=.72; an=.5; al=uAlpha; }
  else { base=uFlg; gloss=.55; metal=.8; al=min(1.,uAlpha+.2); }
  vec3 T=normalize(cross(uAx,N)+uAx*1e-4);
  vec3 col=tonemap(shade(N,V,base,metal,gloss,T,an,1.,1.));
  if(al<1.) al=mix(al,1.,pow(1.-max(dot(N,V),0.),2.)*.6);
  al*=uItem; o=vec4(col*al,al);
}`],
  mesh: [HEAD + `layout(location=0) in vec3 aP; layout(location=1) in vec3 aN;
uniform mat4 uVP; uniform mat4 uMdl; out vec3 vP; out vec3 vN;
void main(){ vP=(uMdl*vec4(aP,1.)).xyz; vN=mat3(uMdl)*aN; gl_Position=uVP*vec4(vP,1.); }`,
    HEAD + `uniform vec3 uBase; uniform vec3 uMat; uniform int uZeb; uniform float uZk;
${COMMON}
in vec3 vP; in vec3 vN; out vec4 o;
void main(){
  vec3 N=normalize(vN), V=viewDir(vP); if(dot(N,V)<0.&&!gl_FrontFacing) N=-N;
  vec3 col;
  if(uZeb==1){
    /* cebra: reflejo contra tubos de luz paralelos a Y; el ancho de franja se suaviza con fwidth */
    vec3 R=reflect(-V,N); float a=atan(R.z,R.x)*uZk, w=max(fwidth(a),1e-4);
    float s=clamp((abs(fract(a)-.5)-.25)/w+.5,0.,1.);
    col=mix(vec3(.06,.07,.08),vec3(.9,.92,.94),s)*(.8+.2*max(dot(N,uL),0.));
  } else col=tonemap(shade(N,V,uBase,uMat.x,uMat.y,vec3(1,0,0),0.,1.,toolShadow(vP)));
  o=vec4(col*uMat.z,uMat.z);
}`],
  seg: [HEAD + `layout(location=0) in vec4 aA; layout(location=1) in vec4 aB; layout(location=2) in vec2 aS;
uniform mat4 uVP; uniform mat4 uMdl; uniform vec2 uRes; uniform float uW; uniform float uLift; uniform float uBias;
uniform vec4 uCol[8]; uniform float uDash[8];
out float vX; out float vD; flat out vec4 vCol; flat out float vPer;
void main(){
  int c=gl_VertexID&3; bool b=c>1; float side=(c&1)==0?-1.:1.;
  vec4 pa=uVP*vec4((uMdl*vec4(aA.xyz,1.)).xyz+vec3(0,0,uLift),1.), pb=uVP*vec4((uMdl*vec4(aB.xyz,1.)).xyz+vec3(0,0,uLift),1.);
  vec2 sa=pa.xy/pa.w*uRes, sb=pb.xy/pb.w*uRes, d=sb-sa; float l=length(d); d=l>1e-6?d/l:vec2(1,0);
  float hw=uW*.5+1.; vec4 p=b?pb:pa; p.xy+=vec2(-d.y,d.x)*side*hw/uRes*p.w; p.z-=uBias*p.w;
  int t=int(aS.x+.5)&7; gl_Position=p; vX=side*hw; vD=b?aB.w:aA.w; vCol=uCol[t]; vCol.a*=aS.y; vPer=uDash[t];
}`, HEAD + `uniform float uPx; uniform vec2 uUp; uniform float uAlpha; uniform float uW; uniform vec2 uHid;
in float vX; in float vD; flat in vec4 vCol; flat in float vPer; out vec4 o;
void main(){
  if(vD>uUp.y||vD<uUp.x) discard;
  float per=uHid.x>0.?uHid.x:vPer; if(per>0.&&fract(vD*uPx/per)>.5) discard;
  float a=vCol.a*uAlpha*uHid.y*clamp(uW*.5+.5-abs(vX),0.,1.);
  o=vec4(vCol.rgb*a,a);
}`]
};

/* ---------- hub ---------- */
let HUB;
function hub() {
  if (HUB !== undefined) return HUB;
  HUB = null;
  if (P.gl === '0') return null;
  const force = P.gl === 'force';
  const attrs = { alpha: true, premultipliedAlpha: true, antialias: false, depth: true, stencil: false,
    preserveDrawingBuffer: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: true };
  /* con force, segundo intento sin caveat en un lienzo nuevo: nunca se reintenta sobre el mismo */
  let cv, gl = null;
  for (let k = 0; k < (force ? 2 : 1) && !gl; k++) {
    if (k) attrs.failIfMajorPerformanceCaveat = false;
    cv = D.createElement('canvas');
    try { gl = cv.getContext('webgl2', attrs); } catch (e) { gl = null; }
  }
  if (!gl || gl.isContextLost()) return null;
  const dri = gl.getExtension('WEBGL_debug_renderer_info');
  let renderer = '';
  try { renderer = String(gl.getParameter(dri ? dri.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || ''); } catch (e) {}
  const lc = gl.getExtension('WEBGL_lose_context'), soft = SOFT.test(renderer);
  if (soft && !force) { if (lc) lc.loseContext(); cv.width = cv.height = 1; return null; }
  try { HUB = new Hub(cv, gl, renderer, soft, lc); } catch (e) { HUB = null; }
  return HUB;
}

function Hub(cv, gl, renderer, soft, lc) {
  this.cv = cv; this.gl = gl; this.renderer = renderer; this.software = soft; this.lost = false;
  const n = G.navigator || {}, mq = q => { try { return G.matchMedia(q).matches; } catch (e) { return false; } };
  this.tier = soft ? 'C' : mq('(pointer: fine)') && !/Mobi|Android|iPhone|iPad/i.test(n.userAgent || '') && G.innerWidth >= 768 && !(n.deviceMemory <= 4) ? 'A' : 'B';
  this.scenes = []; this.gen = 1; this.progs = {}; this.grids = {}; this.ev = { lost: [], restored: [] };
  this.lc = lc; this.caps();
  this.small = 0; cv.width = cv.height = 1;
  this.debug = { lose: () => this.loseContext(), restore: () => this.restoreContext() };
  cv.addEventListener('webglcontextlost', e => {
    e.preventDefault();
    if (this.lost) return;
    this.lost = true; this.gen++; this.progs = {}; this.grids = {};
    this.emit('lost');
  }, false);
  cv.addEventListener('webglcontextrestored', () => {
    this.lost = false; this.gen++; this.progs = {}; this.grids = {}; this.caps();
    for (const s of this.scenes) s.restored();
    this.emit('restored');
  }, false);
}
Hub.prototype = {
  /* las extensiones hay que volver a pedirlas tras una restauración */
  caps() {
    const gl = this.gl;
    this.par = gl.getExtension('KHR_parallel_shader_compile');
    this.tq = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) || 0);
  },
  on(e, fn) { (this.ev[e] || (this.ev[e] = [])).push(fn); },
  emit(e) { for (const f of this.ev[e] || []) { try { f(); } catch (x) {} } },
  scene(cv2, ctx, view) { const s = new SceneGL(this, cv2, ctx, view); this.scenes.push(s); return s; },
  loseContext() { if (this.lc && !this.lost) this.lc.loseContext(); },
  restoreContext() { if (this.lc && this.lost) this.lc.restoreContext(); },
  get gpuMB() {
    let b = this.cv.width * this.cv.height * 8;
    for (const s of this.scenes) b += s.bytes();
    return +(b / 1048576).toFixed(2);
  },
  stats() { return { gpuMB: this.gpuMB, canvas: [this.cv.width, this.cv.height], scenes: this.scenes.length, renderer: this.renderer, samples: this.samples }; },
  /* compila sin consultar el estado: con KHR_parallel_shader_compile el enlace sigue en segundo plano */
  /* ck: variante barata del nivel C (sin ruido, material del vecino más cercano, sin muestras anisótropas) */
  want(name, ck) {
    const key = ck ? name + 'C' : name;
    if (this.lost || this.progs[key] || this.gl.isContextLost()) return;
    const gl = this.gl, p = gl.createProgram(), s = SRC[name];
    for (let i = 0; i < 2; i++) {
      const sh = gl.createShader(i ? gl.FRAGMENT_SHADER : gl.VERTEX_SHADER);
      gl.shaderSource(sh, ck ? s[i].replace(HEAD, HEAD + '#define CHEAP 1\n') : s[i]); gl.compileShader(sh); gl.attachShader(p, sh);
    }
    gl.linkProgram(p); p.ok = false; this.progs[key] = p;
  },
  prog(name, ck) {
    this.want(name, ck);
    const gl = this.gl, p = this.progs[ck ? name + 'C' : name];
    if (p.ok) return p;
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const log = gl.getAttachedShaders(p).map(s => gl.getShaderInfoLog(s)).join(' ') + gl.getProgramInfoLog(p);
      throw new Error('GLSL ' + name + ': ' + log.slice(0, 400));
    }
    p.u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); p.u[a.name.replace('[0]', '')] = gl.getUniformLocation(p, a.name); }
    p.ok = true;
    return p;
  },
  /* resuelve cuando los programas pedidos están enlazados (o al agotar ms): sin bloquear el hilo en el primer frame() */
  whenReady(ms) {
    const t0 = now();
    return new Promise(res => { const f = () => { if (this.lost || this.ready() || now() - t0 > (ms || 3000)) res(!this.lost); else G.setTimeout(f, 16); }; f(); });
  },
  ready() {
    if (this.lost) return false;
    if (!this.par) return true;
    for (const k in this.progs) if (!this.progs[k].ok && !this.gl.getProgramParameter(this.progs[k], this.par.COMPLETION_STATUS_KHR)) return false;
    return true;
  },
  /* índices de rejilla compartidos por tamaño: tiras con reinicio de primitiva, la posición sale de gl_VertexID */
  grid(nx, ny) {
    const k = nx + 'x' + ny;
    let g = this.grids[k];
    if (g) return g;
    const gl = this.gl, idx = new Uint32Array((ny - 1) * (nx * 2 + 1));
    let w = 0;
    for (let j = 0; j < ny - 1; j++) { for (let i = 0; i < nx; i++) { idx[w++] = (j + 1) * nx + i; idx[w++] = j * nx + i; } idx[w++] = 0xFFFFFFFF; }
    const ib = gl.createBuffer();
    gl.bindVertexArray(null); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    return (this.grids[k] = { ib, n: idx.length });
  },
  /* el lienzo crece al momento y encoge con histéresis: 2 s con el máximo visible por debajo del 85 % */
  size(sc, pw, ph, t) {
    const cv = this.cv;
    sc.lw = pw; sc.lh = ph; sc.lt = t;
    if (pw > cv.width || ph > cv.height) { cv.width = Math.max(cv.width, pw); cv.height = Math.max(cv.height, ph); this.small = 0; return; }
    let mw = 1, mh = 1;
    for (const s of this.scenes) if (t - s.lt < 2000) { if (s.lw > mw) mw = s.lw; if (s.lh > mh) mh = s.lh; }
    if (mw * mh < 0.85 * cv.width * cv.height) {
      if (!this.small) this.small = t;
      else if (t - this.small > 2000) { cv.width = mw; cv.height = mh; this.small = 0; }
    } else this.small = 0;
  }
};

/* ---------- cámara ---------- */
function Camera(sc) {
  this.sc = sc; this.o = { type: 'ortho', az: -45, el: 35, fov: 28, zoom: 1 };
  this.V = new Float32Array(16); this.Pm = new Float32Array(16); this.VP = new Float32Array(16);
  this.eye = new Float32Array(4); this.s = 1; this.key = ''; this.t4 = new Float32Array(4);
}
Camera.prototype.set = function (o) { if (o) for (const k in o) this.o[k] = o[k]; this.key = ''; return this; };
Camera.prototype.update = function (W, H) {
  const k = W + 'x' + H;
  if (this.key === k) return this;
  this.key = k;
  const o = this.o, f = o.fit || {}, bb = f.bbox || [-50, -50, -50, 50, 50, 50], sf = f.safe || {};
  const az = o.az * RAD, el = o.el * RAD, dir = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
  const tg = o.target || [(bb[0] + bb[3]) / 2, (bb[1] + bb[4]) / 2, (bb[2] + bb[5]) / 2];
  const diag = Math.hypot(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]) || 1;
  const up = Math.abs(o.el) > 89.9 ? [-Math.cos(az), -Math.sin(az), 0] : [0, 0, 1];
  const bl = sf.left || 0, br = sf.right || 0, bt = sf.top || 0, bbm = sf.bottom || 0;
  const bw = Math.max(1, W - bl - br), bh = Math.max(1, H - bt - bbm), X0 = bl + bw / 2, Y0 = bt + bh / 2, q = this.t4;
  const ext = d => {
    const e = [tg[0] + dir[0] * d, tg[1] + dir[1] * d, tg[2] + dir[2] * d];
    lookAt(this.V, e, tg, up);
    let l = 1e9, r = -1e9, b = 1e9, t = -1e9, zn = 1e9, zf = -1e9;
    for (let i = 0; i < 8; i++) {
      xfv(this.V, bb[i & 1 ? 3 : 0], bb[i & 2 ? 4 : 1], bb[i & 4 ? 5 : 2], q);
      let x = q[0], y = q[1];
      if (o.type === 'persp') { x /= -q[2]; y /= -q[2]; }
      l = Math.min(l, x); r = Math.max(r, x); b = Math.min(b, y); t = Math.max(t, y); zn = Math.min(zn, q[2]); zf = Math.max(zf, q[2]);
    }
    return { e, l, r, b, t, zn, zf };
  };
  if (o.type === 'persp') {
    const fpx = H / 2 / Math.tan(o.fov * RAD / 2);
    let lo = diag * 0.3, hi = diag * 40, x;
    for (let i = 0; i < 40; i++) {
      const m = (lo + hi) / 2; x = ext(m);
      if ((x.r - x.l) * fpx <= bw && (x.t - x.b) * fpx <= bh) hi = m; else lo = m;
    }
    x = ext(hi / (o.zoom || 1));
    const n = Math.max(1, -x.zf - diag * 0.5), fr = -x.zn + diag + 400, fz = fpx;
    const uc = (x.l + x.r) / 2, vc = (x.b + x.t) / 2;
    frustum(this.Pm, (uc - X0 / fz) * n, (uc + (W - X0) / fz) * n, (vc - (H - Y0) / fz) * n, (vc + Y0 / fz) * n, n, fr);
    this.eye[0] = x.e[0]; this.eye[1] = x.e[1]; this.eye[2] = x.e[2]; this.eye[3] = 1;
    this.s = fz / (hi / (o.zoom || 1));
  } else {
    const x = ext(diag * 2 + 100);
    const s = Math.min(bw / Math.max(1e-6, x.r - x.l), bh / Math.max(1e-6, x.t - x.b)) * (o.zoom || 1);
    let cx = (x.l + x.r) / 2, cy = (x.b + x.t) / 2;
    if (o.focus) { xfv(this.V, o.focus[0], o.focus[1], o.focus[2], q); cx = q[0]; cy = q[1]; }
    const L = cx - X0 / s, T = cy + Y0 / s;
    ortho(this.Pm, L, L + W / s, T - H / s, T, -x.zf - 600, -x.zn + 600);
    this.eye[0] = dir[0]; this.eye[1] = dir[1]; this.eye[2] = dir[2]; this.eye[3] = 0;
    this.s = s;
  }
  mul4(this.VP, this.Pm, this.V);
  return this;
};

/* ---------- recursos por escena (se recrean solos tras una pérdida: los datos viven en CPU) ---------- */
function Res(sc) { this.sc = sc; this.H = sc.H; this.gen = 0; this.g = null; sc.res.push(this); }
Res.prototype.live = function () {
  if (this.H.lost) return false;
  if (this.gen !== this.H.gen) { this.g = null; this.mk(this.H.gl); this.gen = this.H.gen; }
  return true;
};
Res.prototype.dispose = function () {
  const r = this.sc.res, i = r.indexOf(this);
  if (i >= 0) r.splice(i, 1);
  if (this.g && this.gen === this.H.gen && !this.H.lost) this.free(this.H.gl);
  this.g = null;
};
Res.prototype.bytes = function () { return 0; };
Res.prototype.drop = function () { if (this.g && this.gen === this.H.gen && !this.H.lost) this.free(this.H.gl); this.g = null; this.gen = 0; };
const ext = (B, o) => { const F = function () { B.apply(this, arguments); }; F.prototype = Object.assign(Object.create(B.prototype), o); return F; };

function tex(gl, ifmt, fmt, type, data, w, h, filt) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt || gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt || gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texStorage2D(gl.TEXTURE_2D, 1, ifmt, w, h);
  if (data) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, fmt, type, data);
  return t;
}
function vbuf(gl, data, kind) { const b = gl.createBuffer(); gl.bindBuffer(kind || gl.ARRAY_BUFFER, b); gl.bufferData(kind || gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; }

const MATS = {
  steel: { cut: '#9AA3AA', raw: '#7C848B' }, steelHard: { cut: '#7E868D', raw: '#7C848B' }, h13: { cut: '#848C93', raw: '#7C848B' },
  alu: { cut: '#C9CED3', raw: '#8E959C' }
};
const RAWS = { ground: 0, rolled: 1, milled: 2 };

const Terrain = ext(Res, {
  init(zm, o) {
    this.zm = zm; this.o = o; this.mode = 'tool'; this.compareFade = 1; this.marks = o.marks == null ? 1 : o.marks;
    this.section = o.section || null; this.model = o.model || null; this.full = true; this.bakeR = null;
    const m = MATS[o.material] || MATS.steel, cut = (o.colors && o.colors.cut) || m.cut, raw = (o.colors && o.colors.raw) || m.raw;
    const col = this.col = new Float32Array(24), t = o.tints || {};
    for (let i = 0; i < 8; i++) { const c = i === 0 ? lin(raw) : t[i] ? mixHex(cut, t[i][0], Math.min(0.15, t[i][1])) : lin(cut); col.set(c, i * 3); }
    this.cut = new Float32Array(lin(cut)); this.raw = RAWS[o.raw] != null ? RAWS[o.raw] : 0;
    this.tol = new Float32Array([o.tolIn || 0.02, o.tolOut || 0.05]);
    const cm = (PAL.cmp) || { excess: '#4CC9F0', ok: '#2EE6A8', gouge: '#FF5A3C' };
    this.cmp = new Float32Array([].concat(hex3(cm.excess), hex3(cm.ok), hex3(cm.gouge)));
    this.ms = 0; this.cells = 0;
  },
  mk(gl) {
    const zm = this.zm, nx = zm.nx, ny = zm.ny, H = this.H;
    ['ter', 'bake', 'seg', 'tool'].forEach(n => this.sc.want(n));
    const g = this.g = {};
    g.h = tex(gl, gl.R32F, gl.RED, gl.FLOAT, null, nx, ny);
    g.a = tex(gl, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, null, nx, ny, gl.LINEAR);
    g.m = tex(gl, gl.R32F, gl.RED, gl.FLOAT, null, nx, ny);
    g.d = tex(gl, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, null, nx, ny, gl.LINEAR);
    g.fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, g.fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, g.d, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    g.vao = gl.createVertexArray(); g.k = 0;
    this.full = true; this.mdirty = true;
  },
  /* nivel C: con celdas de menos de ~2 px de dispositivo el coste lo marca el número de triángulos (SwiftShader), así
     que la malla va a una de cada dos celdas; con histéresis para que no salte al orbitar */
  lod(sc) {
    if (sc.view.tier !== 'C') return (this.k = 1);
    const px = sc.cam.s * this.zm.cell * sc.view.scale;
    this.k = this.k === 2 ? (px > 2.3 ? 1 : 2) : (px < 2 ? 2 : 1);
    return this.k;
  },
  free(gl) { const g = this.g; gl.deleteTexture(g.h); gl.deleteTexture(g.a); gl.deleteTexture(g.m); gl.deleteTexture(g.d); gl.deleteFramebuffer(g.fb); gl.deleteVertexArray(g.vao); },
  bytes() { return this.zm.nx * this.zm.ny * 16; },
  markAll() { this.full = true; },
  setModel(m) { this.model = m; this.mdirty = true; },
  update() { if (this.live()) this.sync(this.H.gl); },
  /* sube el rectángulo sucio y hornea AO, sombra y normal; la zona se amplía 3.5 mm y 24 mm contra la luz */
  sync(gl) {
    const zm = this.zm, g = this.g, nx = zm.nx, ny = zm.ny, t0 = now();
    if (this.mdirty) {
      gl.bindTexture(gl.TEXTURE_2D, g.m);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, nx, ny, gl.RED, gl.FLOAT, this.model || zm.h);
      this.mdirty = false;
    }
    if (!this.full && !zm.isDirty()) return;
    let x = 0, y = 0, w = nx, h = ny;
    if (!this.full) { x = Math.max(0, zm.x0); y = Math.max(0, zm.y0); w = Math.min(nx - 1, zm.x1) - x + 1; h = Math.min(ny - 1, zm.y1) - y + 1; }
    if (w > 0 && h > 0) {
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, nx);
      gl.bindTexture(gl.TEXTURE_2D, g.h); gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RED, gl.FLOAT, zm.h, y * nx + x);
      gl.bindTexture(gl.TEXTURE_2D, g.a); gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, zm.at, (y * nx + x) * 4);
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
      const pad = Math.ceil(3.5 / zm.cell), sl = Math.ceil(24 / zm.cell), lx = L1[0], ly = L1[1], ll = Math.hypot(lx, ly);
      let x0 = x - pad, x1 = x + w + pad, y0 = y - pad, y1 = y + h + pad;
      if (lx > 0) x0 -= Math.ceil(sl * lx / ll); else x1 += Math.ceil(-sl * lx / ll);
      if (ly > 0) y0 -= Math.ceil(sl * ly / ll); else y1 += Math.ceil(-sl * ly / ll);
      const r = this.full ? [0, 0, nx, ny] : [Math.max(0, x0), Math.max(0, y0), Math.min(nx, x1), Math.min(ny, y1)];
      const p = this.sc.prog('bake');
      gl.bindFramebuffer(gl.FRAMEBUFFER, g.fb); gl.viewport(0, 0, nx, ny);
      gl.enable(gl.SCISSOR_TEST); gl.scissor(r[0], r[1], r[2] - r[0], r[3] - r[1]);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      gl.useProgram(p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, g.h);
      gl.uniform1i(p.u.uH, 0); gl.uniform2i(p.u.uN, nx, ny); gl.uniform2f(p.u.uS, zm.sx, zm.sy); gl.uniform3fv(p.u.uL, L1);
      gl.bindVertexArray(this.sc.vaoE()); gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.cells = (r[2] - r[0]) * (r[3] - r[1]);
    }
    this.full = false; zm.clean();
    this.ms = now() - t0;
  },
  draw(gl, sc, it) {
    const zm = this.zm, g = this.g, p = sc.prog('ter'), u = p.u, cam = sc.cam;
    gl.useProgram(p); sc.common(p);
    gl.uniformMatrix4fv(u.uVP, false, cam.VP);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, g.h); gl.uniform1i(u.uH, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, g.a); gl.uniform1i(u.uA, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, g.d); gl.uniform1i(u.uD, 2);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, g.m); gl.uniform1i(u.uM, 3);
    gl.uniform2i(u.uN, zm.nx, zm.ny); gl.uniform2f(u.uS, zm.sx, zm.sy); gl.uniform2f(u.uO, zm.ox, zm.oy); gl.uniform1f(u.uBot, zm.bottom);
    gl.uniform1i(u.uMode, this.mode === 'compare' && this.compareFade > 0 ? 1 : 0); gl.uniform1f(u.uFade, this.compareFade);
    gl.uniform1f(u.uMarks, this.marks); gl.uniform1i(u.uRaw, this.raw);
    gl.uniform3fv(u.uCol, this.col); gl.uniform3fv(u.uCut, this.cut); gl.uniform3fv(u.uCmp, this.cmp); gl.uniform2fv(u.uTol, this.tol);
    const s = this.section;
    gl.uniform4f(u.uSec, s ? (s.axis === 'x' ? 1 : 2) : 0, s ? s.at : 0, s && s.keep === '-' ? -1 : 1, 0);
    gl.uniform1f(u.uHatch, 5 * sc.view.scale);
    const k = this.lod(sc), gr = sc.H.grid(Math.ceil((zm.nx - 1) / k) + 1, Math.ceil((zm.ny - 1) / k) + 1);
    gl.bindVertexArray(g.vao);
    if (g.k !== k || g.ib !== gr.ib) { gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gr.ib); g.k = k; g.ib = gr.ib; }
    gl.uniform1i(u.uK, k); gl.uniform1i(u.uSide, 0); gl.drawElements(gl.TRIANGLE_STRIP, gr.n, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(sc.vaoE());
    for (let k = 1; k <= 4; k++) { gl.uniform1i(u.uSide, k); gl.drawArrays(gl.TRIANGLE_STRIP, 0, (k & 1 ? zm.nx : zm.ny) * 2); }
    if (s) { gl.uniform1i(u.uSide, 5); gl.drawArrays(gl.TRIANGLE_STRIP, 0, (s.axis === 'x' ? zm.ny : zm.nx) * 2); }
  }
});

/* herramienta y portaherramientas como sólido de revolución del perfil de Tool.stack() (arista viva entre tiras) */
const ToolMesh = ext(Res, {
  init(T, o) { this.set(T, o); },
  set(T, o) {
    this.drop();
    const seg = (o && o.seg) || 40, S = T.stack(), P = [], I0 = [], I1 = [];
    for (const st of S) {
      const pts = st.pts, base = P.length / 9, n = pts.length, pi = st.pi != null ? st.pi : Math.max(0, ['cut', 'neck', 'shank', 'nut', 'holder', 'flange'].indexOf(st.part));
      for (let k = 0; k < n; k++) {
        const a = pts[Math.max(0, k - 1)], b = pts[Math.min(n - 1, k + 1)];
        let tr = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tr, tz) || 1; tr /= l; tz /= l;
        for (let m = 0; m <= seg; m++) {
          const ang = m / seg * 2 * PI, c = Math.cos(ang), s = Math.sin(ang);
          P.push(pts[k][0] * c, pts[k][0] * s, pts[k][1], tz * c, tz * s, -tr, pi, ang, pts[k][1]);
        }
      }
      const L = pi >= 3 ? I1 : I0;
      for (let k = 0; k < n - 1; k++) for (let m = 0; m < seg; m++) {
        const v0 = base + k * (seg + 1) + m, v1 = v0 + seg + 1;
        L.push(v0, v0 + 1, v1, v1, v0 + 1, v1 + 1);
      }
    }
    this.T = T; this.P = new Float32Array(P); this.n0 = I0.length; this.n1 = I1.length;
    const I = I0.concat(I1); this.I = P.length / 9 > 65535 ? new Uint32Array(I) : new Uint16Array(I);
    /* cápsulas de sombra: filo y mango, nariz del porta, brida */
    const env = T.envelope(), H = T.holder || {}, zg = T.gauge || (T.stick + (H.A || 100));
    let rc = 0, rn = 0, zn0 = 1e9, zn1 = -1e9, rf = 0, zf0 = 1e9;
    for (const e of env) {
      if (e.part === 'cut' || e.part === 'neck' || e.part === 'shank') rc = Math.max(rc, e.part === 'cut' ? e.r : 0);
      else if (e.part === 'flange') { rf = Math.max(rf, e.r); zf0 = Math.min(zf0, e.z0); }
      else { rn = Math.max(rn, Math.min(e.r, (H.nose || 24) / 2 + 2)); zn0 = Math.min(zn0, e.z0); zn1 = Math.max(zn1, e.z1); }
    }
    this.caps = [[rc || T.R, 0, T.stick], [rn, zn0 < 1e9 ? zn0 : T.stick, zn1 > -1e9 ? zn1 : zg - 20], [rf, zf0 < 1e9 ? zf0 : zg - 20, zg]];
    this.coat = new Float32Array(lin(T.coat || (PAL.tool && PAL.tool.coat) || '#3B3640').map(v => v * 2.2));
    this.gen = 0;
    return this;
  },
  mk(gl) {
    const g = this.g = {};
    this.sc.want('tool');
    g.vao = gl.createVertexArray(); gl.bindVertexArray(g.vao);
    g.vb = vbuf(gl, this.P);
    for (let i = 0; i < 3; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 3, gl.FLOAT, false, 36, i * 12); }
    g.ib = vbuf(gl, this.I, gl.ELEMENT_ARRAY_BUFFER);
    gl.bindVertexArray(null);
  },
  free(gl) { gl.deleteVertexArray(this.g.vao); gl.deleteBuffer(this.g.vb); gl.deleteBuffer(this.g.ib); },
  bytes() { return this.P.byteLength + this.I.byteLength; },
  draw(gl, sc, it, pass) {
    const p = sc.prog('tool'), u = p.u, T = this.T, M = it.M || poseTo(sc.m4, it.pos || [0, 0, 0], it.axis), et = this.I.BYTES_PER_ELEMENT;
    const ty = et === 4 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
    gl.useProgram(p); sc.common(p);
    gl.uniformMatrix4fv(u.uVP, false, sc.cam.VP); gl.uniformMatrix4fv(u.uMdl, false, M);
    gl.uniform3f(u.uAx, M[8], M[9], M[10]);
    gl.uniform1f(u.uSpin, it.spin == null ? 1 : it.spin); gl.uniform1f(u.uFl, T.z || 2); gl.uniform1f(u.uLead, T.lead || PI * T.D / Math.tan((T.helix || 35) * RAD));
    gl.uniform3fv(u.uCoat, this.coat); gl.uniform3fv(u.uShank, sc.H.colShank); gl.uniform3fv(u.uHold, sc.H.colHold); gl.uniform3fv(u.uFlg, sc.H.colFlg);
    gl.uniform1f(u.uItem, it.alpha == null ? 1 : it.alpha);
    gl.uniform1f(u.uAlpha, it.holderAlpha == null ? ((PAL.tool && PAL.tool.holderAlpha) || 0.4) : it.holderAlpha);
    gl.bindVertexArray(this.g.vao); gl.enable(gl.CULL_FACE);
    if (pass === 0) gl.drawElements(gl.TRIANGLES, this.n0, ty, 0);
    else if (this.n1) gl.drawElements(gl.TRIANGLES, this.n1, ty, this.n0 * et);
    gl.disable(gl.CULL_FACE);
  }
});

/* segmentos con distancia acumulada: backplot, aristas y vectores. Cuadriláteros indexados de 4 vértices (el
   vértice sale de gl_VertexID & 3): con instancias, SwiftShader pagaba ~20 µs por tramo. */
const SV = 40;
function segBuf(n) { return new Float32Array(n * SV); }
function putSeg(a, i, x0, y0, z0, d0, x1, y1, z1, d1, st, al) {
  for (let c = 0, o = i * SV; c < 4; c++, o += 10) {
    a[o] = x0; a[o + 1] = y0; a[o + 2] = z0; a[o + 3] = d0; a[o + 4] = x1; a[o + 5] = y1; a[o + 6] = z1; a[o + 7] = d1; a[o + 8] = st; a[o + 9] = al;
  }
}
function segVao(gl, g, data, n, dyn) {
  g.vao = gl.createVertexArray(); gl.bindVertexArray(g.vao);
  g.vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, g.vb); gl.bufferData(gl.ARRAY_BUFFER, data, dyn ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 40, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 40, 16);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 40, 32);
  const I = n * 4 > 65536 ? new Uint32Array(n * 6) : new Uint16Array(n * 6);
  for (let k = 0, q = 0; k < n; k++, q += 6) { const v = k * 4; I[q] = v; I[q + 1] = v + 1; I[q + 2] = v + 2; I[q + 3] = v + 2; I[q + 4] = v + 1; I[q + 5] = v + 3; }
  g.ib = vbuf(gl, I, gl.ELEMENT_ARRAY_BUFFER); g.it = I.BYTES_PER_ELEMENT === 4 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT; g.ie = I.BYTES_PER_ELEMENT;
  gl.bindVertexArray(null);
}
function segFree(gl, g) { gl.deleteVertexArray(g.vao); gl.deleteBuffer(g.vb); gl.deleteBuffer(g.ib); }
function styleArr(list) {
  const c = new Float32Array(32), d = new Float32Array(8);
  for (let i = 0; i < 8; i++) {
    const s = list[i] || list[0], rgb = hex3(s.c || '#2EE6A8');
    c[i * 4] = rgb[0]; c[i * 4 + 1] = rgb[1]; c[i * 4 + 2] = rgb[2]; c[i * 4 + 3] = s.a == null ? 1 : s.a;
    d[i] = s.dash ? s.dash[0] + (s.dash[1] || s.dash[0]) : 0;
  }
  return { c, d };
}
function drawSegs(gl, sc, it, g, n, sty, o, first) {
  first = first || 0;
  if (n <= first) return;
  const p = sc.prog('seg'), u = p.u, v = sc.view, w = Math.max(1, (it.width || o.width || 1) * v.scale);
  gl.useProgram(p);
  gl.uniformMatrix4fv(u.uVP, false, sc.cam.VP); gl.uniformMatrix4fv(u.uMdl, false, it.M || IDM);
  gl.uniform2f(u.uRes, v.pw / 2, v.ph / 2); gl.uniform1f(u.uW, w);
  gl.uniform1f(u.uLift, o.lift || 0); gl.uniform1f(u.uBias, o.bias || 0);
  gl.uniform4fv(u.uCol, sty.c); gl.uniform1fv(u.uDash, sty.d); gl.uniform1f(u.uPx, sc.cam.s);
  gl.uniform2f(u.uUp, o.from == null ? -1e9 : o.from, o.upTo == null ? 1e9 : o.upTo);
  gl.uniform1f(u.uAlpha, it.alpha == null ? 1 : it.alpha);
  gl.uniform2f(u.uHid, o.hid ? o.hid[0] : 0, o.hid ? o.hid[1] : 1);
  gl.bindVertexArray(g.vao); gl.drawElements(gl.TRIANGLES, (n - first) * 6, g.it, first * 6 * g.ie);
}
/* primer índice con a[i] > x en un array creciente */
function upper(a, n, x) { let lo = 0, hi = n; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] > x) hi = m; else lo = m + 1; } return lo; }

const Lines = ext(Res, {
  init(path, o) { o = o || {}; this.upTo = o.upTo == null ? 1e9 : o.upTo; this.from = o.from || 0; this.alpha = o.alpha == null ? 1 : o.alpha; this.width = o.width || 1; this.sty = styleArr(o.styles || PAL.path || [{ c: '#2EE6A8', a: 0.55 }]); this.set(path); },
  set(path) {
    this.drop();
    const n = path.n, p = path.pts, d = path.dist, a = segBuf(Math.max(1, n - 1)), d0 = new Float32Array(Math.max(1, n - 1)), d1 = new Float32Array(Math.max(1, n - 1));
    let k = 0;
    for (let i = 0; i + 1 < n; i++) {
      const j = (i + 1) * 4, q = i * 4;
      if (p[q] === p[j] && p[q + 1] === p[j + 1] && p[q + 2] === p[j + 2]) continue;
      d0[k] = d[i]; d1[k] = d[i + 1];
      putSeg(a, k++, p[q], p[q + 1], p[q + 2], d[i], p[j], p[j + 1], p[j + 2], d[i + 1], p[j + 3], 1);
    }
    this.data = a; this.d0 = d0; this.d1 = d1; this.n = k; this.len = path.len; this.gen = 0;
    return this;
  },
  mk(gl) { this.sc.want('seg'); segVao(gl, this.g = {}, this.data.subarray(0, Math.max(1, this.n) * SV), Math.max(1, this.n)); },
  free(gl) { segFree(gl, this.g); },
  bytes() { return this.n * (SV * 4 + 12); },
  /* solo se envían los tramos entre from y upTo; el fragment shader recorta el tramo a medias */
  draw(gl, sc, it) {
    const a = this.ia || (this.ia = {}), o = this.io || (this.io = { lift: 0.06, bias: 0.002 });
    a.alpha = (it.alpha == null ? 1 : it.alpha) * this.alpha; a.M = it.M; a.width = it.width || this.width;
    o.upTo = it.upTo != null ? it.upTo : this.upTo; o.from = it.from != null ? it.from : this.from;
    drawSegs(gl, sc, a, this.g, upper(this.d0, this.n, o.upTo), this.sty, o, o.from > 0 ? upper(this.d1, this.n, o.from - 1e-6) : 0);
  }
});

const VEC = { bias: 0.003 };
const Vectors = ext(Res, {
  init(max, o) {
    o = o || {}; this.max = max; this.data = segBuf(max); this.n = 0; this.dirty = true; this.width = o.width || 1.5;
    this.sty = styleArr(o.styles || [{ c: '#D4AF37', a: 1 }, { c: '#EAF0F6', a: 0.8, dash: [3, 3] }, { c: '#D4AF37', a: 0.5 }]);
  },
  clear() { this.n = 0; this.dirty = true; return this; },
  push(p, d, len, style, alpha) {
    if (this.n >= this.max) return this;
    const l = len / (Math.hypot(d[0], d[1], d[2]) || 1);
    putSeg(this.data, this.n++, p[0], p[1], p[2], 0, p[0] + d[0] * l, p[1] + d[1] * l, p[2] + d[2] * l, len, style || 0, alpha == null ? 1 : alpha);
    this.dirty = true; return this;
  },
  mk(gl) { this.sc.want('seg'); segVao(gl, this.g = {}, this.data, this.max, true); this.dirty = true; },
  free(gl) { segFree(gl, this.g); },
  bytes() { return this.max * SV * 4; },
  draw(gl, sc, it) {
    if (this.dirty) { gl.bindBuffer(gl.ARRAY_BUFFER, this.g.vb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.n * SV); this.dirty = false; }
    const a = this.ia || (this.ia = {});
    a.alpha = it.alpha; a.M = it.M; a.width = it.width || this.width;
    drawSegs(gl, sc, a, this.g, this.n, this.sty, VEC);
  }
});

/* ---------- mallas ---------- */
function ear(poly) {
  const n = poly.length / 2, idx = [], V = [];
  let area = 0;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; area += poly[i * 2] * poly[j * 2 + 1] - poly[j * 2] * poly[i * 2 + 1]; }
  for (let i = 0; i < n; i++) V.push(area > 0 ? i : n - 1 - i);
  const X = i => poly[i * 2], Y = i => poly[i * 2 + 1];
  let guard = 0;
  while (V.length > 3 && guard++ < n * n) {
    let cut = false;
    for (let k = 0; k < V.length; k++) {
      const a = V[(k + V.length - 1) % V.length], b = V[k], c = V[(k + 1) % V.length];
      if ((X(b) - X(a)) * (Y(c) - Y(a)) - (Y(b) - Y(a)) * (X(c) - X(a)) <= 1e-12) continue;
      let inside = false;
      for (const q of V) {
        if (q === a || q === b || q === c) continue;
        const d1 = (X(b) - X(a)) * (Y(q) - Y(a)) - (Y(b) - Y(a)) * (X(q) - X(a)), d2 = (X(c) - X(b)) * (Y(q) - Y(b)) - (Y(c) - Y(b)) * (X(q) - X(b)), d3 = (X(a) - X(c)) * (Y(q) - Y(c)) - (Y(a) - Y(c)) * (X(q) - X(c));
        if (d1 >= 0 && d2 >= 0 && d3 >= 0) { inside = true; break; }
      }
      if (inside) continue;
      idx.push(a, b, c); V.splice(k, 1); cut = true; break;
    }
    if (!cut) break;
  }
  if (V.length === 3) idx.push(V[0], V[1], V[2]);
  return idx;
}
/* geometría en CPU: {pos, nrm, idx, edges} a partir de la definición */
function build(def) {
  const P = [], N = [], I = [], E = [];
  const v = (x, y, z, nx, ny, nz) => { P.push(x, y, z); N.push(nx, ny, nz); return P.length / 3 - 1; };
  const e = (a, b) => E.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  const at = def.at || [0, 0, 0];
  if (def.kind === 'box') {
    const s = def.size, h = [s[0] / 2, s[1] / 2, s[2] / 2];
    for (let ax = 0; ax < 3; ax++) for (let sg = -1; sg <= 1; sg += 2) {
      const n = [0, 0, 0]; n[ax] = sg; const u = (ax + 1) % 3, w = (ax + 2) % 3, b = P.length / 3;
      for (let k = 0; k < 4; k++) { const p = [0, 0, 0]; p[ax] = sg * h[ax]; p[u] = (k & 1 ? 1 : -1) * h[u]; p[w] = (k & 2 ? 1 : -1) * h[w]; v(p[0] + at[0], p[1] + at[1], p[2] + at[2], n[0], n[1], n[2]); }
      if (sg > 0) I.push(b, b + 1, b + 3, b, b + 3, b + 2); else I.push(b, b + 3, b + 1, b, b + 2, b + 3);
    }
    for (let ax = 0; ax < 3; ax++) for (let k = 0; k < 4; k++) {
      const u = (ax + 1) % 3, w = (ax + 2) % 3, a = [0, 0, 0], b = [0, 0, 0];
      a[ax] = -h[ax]; b[ax] = h[ax]; a[u] = b[u] = (k & 1 ? 1 : -1) * h[u]; a[w] = b[w] = (k & 2 ? 1 : -1) * h[w];
      e([a[0] + at[0], a[1] + at[1], a[2] + at[2]], [b[0] + at[0], b[1] + at[1], b[2] + at[2]]);
    }
  } else if (def.kind === 'cyl' || def.kind === 'lathe') {
    const sg = def.seg || 48, z0 = def.z0 || 0;
    const pr = def.kind === 'cyl' ? [[0, z0], [def.r, z0], [def.r, z0 + def.h], [0, z0 + def.h]] : def.profile;
    for (let k = 0; k + 1 < pr.length; k++) {
      const a = pr[k], b = pr[k + 1], tr = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tr, tz) || 1, base = P.length / 3;
      for (let i = 0; i <= sg; i++) {
        const t = i / sg * 2 * PI, c = Math.cos(t), s = Math.sin(t);
        v(a[0] * c + at[0], a[0] * s + at[1], a[1] + at[2], tz / l * c, tz / l * s, -tr / l);
        v(b[0] * c + at[0], b[0] * s + at[1], b[1] + at[2], tz / l * c, tz / l * s, -tr / l);
      }
      for (let i = 0; i < sg; i++) { const q = base + i * 2; I.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
    }
    for (const p of pr) if (p[0] > 1e-6) for (let i = 0; i < sg; i++) {
      const t0 = i / sg * 2 * PI, t1 = (i + 1) / sg * 2 * PI;
      e([p[0] * Math.cos(t0) + at[0], p[0] * Math.sin(t0) + at[1], p[1] + at[2]], [p[0] * Math.cos(t1) + at[0], p[0] * Math.sin(t1) + at[1], p[1] + at[2]]);
    }
  } else if (def.kind === 'extrude') {
    const sh = def.shape instanceof Float32Array ? Array.from(def.shape) : [].concat(...def.shape), n = sh.length / 2, z0 = def.z0 || 0, z1 = def.z1;
    let ar = 0; for (let i = 0; i < n; i++) { const j = (i + 1) % n; ar += sh[i * 2] * sh[j * 2 + 1] - sh[j * 2] * sh[i * 2 + 1]; }
    const tri = ear(sh), sgn = ar > 0 ? 1 : -1;
    for (const zc of [z0, z1]) {
      const b = P.length / 3, up = zc === z1 ? 1 : -1;
      for (let i = 0; i < n; i++) v(sh[i * 2] + at[0], sh[i * 2 + 1] + at[1], zc + at[2], 0, 0, up);
      for (let i = 0; i < tri.length; i += 3) if (up > 0) I.push(b + tri[i], b + tri[i + 1], b + tri[i + 2]); else I.push(b + tri[i], b + tri[i + 2], b + tri[i + 1]);
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, x0 = sh[i * 2], y0 = sh[i * 2 + 1], x1 = sh[j * 2], y1 = sh[j * 2 + 1], l = Math.hypot(x1 - x0, y1 - y0) || 1;
      const nx = (y1 - y0) / l * sgn, ny = -(x1 - x0) / l * sgn, b = P.length / 3;
      v(x0 + at[0], y0 + at[1], z0 + at[2], nx, ny, 0); v(x1 + at[0], y1 + at[1], z0 + at[2], nx, ny, 0);
      v(x0 + at[0], y0 + at[1], z1 + at[2], nx, ny, 0); v(x1 + at[0], y1 + at[1], z1 + at[2], nx, ny, 0);
      if (sgn > 0) I.push(b, b + 1, b + 3, b, b + 3, b + 2); else I.push(b, b + 3, b + 1, b, b + 2, b + 3);
      for (const zc of [z0, z1]) e([x0 + at[0], y0 + at[1], zc + at[2]], [x1 + at[0], y1 + at[1], zc + at[2]]);
      const k = (i + n - 1) % n, ax = sh[i * 2] - sh[k * 2], ay = sh[i * 2 + 1] - sh[k * 2 + 1];
      const cs = (ax * (x1 - x0) + ay * (y1 - y0)) / ((Math.hypot(ax, ay) || 1) * l);
      if (cs < Math.cos(30 * RAD)) e([x0 + at[0], y0 + at[1], z0 + at[2]], [x0 + at[0], y0 + at[1], z1 + at[2]]);
    }
  } else {
    const pos = def.pos, idx = def.idx;
    let nrm = def.nrm;
    if (!nrm) {
      nrm = new Float32Array(pos.length);
      for (let i = 0; i < idx.length; i += 3) {
        const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
        const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], wx = pos[c] - pos[a], wy = pos[c + 1] - pos[a + 1], wz = pos[c + 2] - pos[a + 2];
        const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
        for (const q of [a, b, c]) { nrm[q] += nx; nrm[q + 1] += ny; nrm[q + 2] += nz; }
      }
      for (let i = 0; i < nrm.length; i += 3) { const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1; nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l; }
    }
    return { pos: pos instanceof Float32Array ? pos : new Float32Array(pos), nrm, idx, edges: def.edges };
  }
  return { pos: new Float32Array(P), nrm: new Float32Array(N), idx: I, edges: def.edges || new Float32Array(E) };
}
const HID = { hid: [7, 0.35] }, VIS = { bias: 0.0005 };
const Mesh = ext(Res, {
  init(def) {
    const b = build(def), nv = b.pos.length / 3, m = def.material || {};
    const v = new Float32Array(nv * 6);
    for (let i = 0; i < nv; i++) { v.set(b.pos.subarray(i * 3, i * 3 + 3), i * 6); v.set(b.nrm.subarray(i * 3, i * 3 + 3), i * 6 + 3); }
    this.V = v; this.I = b.idx instanceof Uint32Array || b.idx instanceof Uint16Array ? b.idx : nv > 65535 ? new Uint32Array(b.idx) : new Uint16Array(b.idx);
    this.base = new Float32Array(lin(m.color || '#9AA8B6')); this.mat = new Float32Array([m.metal == null ? 0.3 : m.metal, m.gloss == null ? 0.45 : m.gloss, 1]);
    this.alpha = m.alpha == null ? 1 : m.alpha; this.zk = (def.zebra || 20) / PI;
    this.setEdges(b.edges);
  },
  /* aristas: pares de puntos; la distancia se acumula mientras los tramos se encadenan (discontinuo continuo) */
  setEdges(E) {
    this.drop();
    const n = E ? E.length / 6 : 0, a = segBuf(Math.max(1, n));
    let d = 0;
    for (let i = 0; i < n; i++) {
      const q = i * 6, l = Math.hypot(E[q + 3] - E[q], E[q + 4] - E[q + 1], E[q + 5] - E[q + 2]);
      if (i && (E[q] !== E[q - 3] || E[q + 1] !== E[q - 2] || E[q + 2] !== E[q - 1])) d = 0;
      putSeg(a, i, E[q], E[q + 1], E[q + 2], d, E[q + 3], E[q + 4], E[q + 5], d + l, 0, 1); d += l;
    }
    this.E = a; this.ne = n; this.gen = 0;
    return this;
  },
  mk(gl) {
    const g = this.g = {};
    this.sc.want('mesh'); this.sc.want('seg');
    g.vao = gl.createVertexArray(); gl.bindVertexArray(g.vao);
    g.vb = vbuf(gl, this.V);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    g.ib = vbuf(gl, this.I, gl.ELEMENT_ARRAY_BUFFER);
    gl.bindVertexArray(null);
    g.e = {}; segVao(gl, g.e, this.E, Math.max(1, this.ne));
  },
  free(gl) { const g = this.g; gl.deleteVertexArray(g.vao); gl.deleteBuffer(g.vb); gl.deleteBuffer(g.ib); segFree(gl, g.e); },
  bytes() { return this.V.byteLength + this.I.byteLength + this.E.byteLength; },
  surf(gl, sc, it, depthOnly) {
    const p = sc.prog('mesh'), u = p.u, a = (it.alpha == null ? 1 : it.alpha) * this.alpha;
    gl.useProgram(p); sc.common(p);
    gl.uniformMatrix4fv(u.uVP, false, sc.cam.VP); gl.uniformMatrix4fv(u.uMdl, false, it.M || IDM);
    if (it.color && it.color !== this.ck) { this.ck = it.color; this.cb = new Float32Array(lin(it.color)); }
    gl.uniform3fv(u.uBase, it.color ? this.cb : this.base);
    gl.uniform3f(u.uMat, this.mat[0], this.mat[1], a);
    gl.uniform1i(u.uZeb, it.mode === 'zebra' ? 1 : 0); gl.uniform1f(u.uZk, it.zebra ? it.zebra / PI : this.zk);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1, 2);
    if (depthOnly) gl.colorMask(false, false, false, false);
    gl.bindVertexArray(this.g.vao);
    gl.drawElements(gl.TRIANGLES, this.I.length, this.I.BYTES_PER_ELEMENT === 4 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
    if (depthOnly) gl.colorMask(true, true, true, true);
    gl.disable(gl.POLYGON_OFFSET_FILL);
  },
  edges(gl, sc, it) {
    if (!this.ne) return;
    const wire = WIRE[it.mode], col = it.edgeColor || (wire ? '#2EE6A8' : '#1B2634'), sty = this.sty && this.styC === col ? this.sty : (this.styC = col, this.sty = styleArr([{ c: col, a: 1 }]));
    const ia = this.ia || (this.ia = {});
    ia.alpha = it.alpha; ia.M = it.M; ia.width = it.edgeWidth || 1;
    if (it.mode === 'edges' && it.hidden !== false) {
      gl.depthFunc(gl.GREATER);
      HID.hid[1] = it.hiddenAlpha == null ? 0.35 : it.hiddenAlpha;
      drawSegs(gl, sc, ia, this.g.e, this.ne, sty, HID);
      gl.depthFunc(gl.LEQUAL);
    }
    drawSegs(gl, sc, ia, this.g.e, this.ne, sty, VIS);
  }
});

/* ---------- escena ---------- */
/* modos de malla que solo escriben profundidad: alámbrico con ocultas, sin ocultas, y oclusor invisible */
const WIRE = { edges: 1, hidden: 1, depth: 1 };
function SceneGL(H, cv2, ctx, view) {
  this.H = H; this.cv2 = cv2; this.ctx = ctx; this.view = view || { w: cv2.width, h: cv2.height, scale: 1, ox: 0, oy: 0, pw: cv2.width, ph: cv2.height, msaa: false };
  this.res = []; this.cam = new Camera(this); this.m4 = new Float32Array(16);
  this.caps = new Float32Array(12); this.capB = new Float32Array(9);
  this.copyMs = undefined; this.gpuMs = undefined; this.ms = { sync: 0, draw: 0, copy: 0, total: 0 };
  this.lw = this.lh = 0; this.lt = -1e9; this.fb = null; this.fbGen = 0; this.q = []; this.disposed = false;
  if (!H.colShank) { H.colShank = new Float32Array(lin((PAL.tool && PAL.tool.shank) || '#8C9399')); H.colHold = new Float32Array(lin((PAL.tool && PAL.tool.holder) || '#8A96A3')); H.colFlg = new Float32Array(lin((PAL.tool && PAL.tool.flange) || '#4A5056')); }
}
SceneGL.prototype = {
  /* los programas se piden al crear el recurso: con KHR_parallel_shader_compile enlazan mientras la escena sigue */
  terrain(zm, o) { const t = new Terrain(this); t.init(zm, o || {}); ['ter', 'bake', 'seg', 'tool'].forEach(n => this.want(n)); return t; },
  tool(T, o) { const t = new ToolMesh(this); t.init(T, o); this.want('tool'); return t; },
  mesh(def) { const m = new Mesh(this); m.init(def); this.want('mesh'); this.want('seg'); return m; },
  lines(path, o) { const l = new Lines(this); l.init(path, o); this.want('seg'); return l; },
  want(n) { if (!this.H.lost) this.H.want(n, this.view.tier === 'C'); },
  prog(n) { return this.H.prog(n, this.view.tier === 'C'); },
  vectors(max, o) { const v = new Vectors(this); v.init(max, o); this.want('seg'); return v; },
  camera(o) { return this.cam.set(o); },
  ready() { return this.H.ready(); },
  whenReady(ms) { return this.H.whenReady(ms); },
  bytes() {
    let b = 0; for (const r of this.res) b += r.bytes();
    if (this.fb) b += this.fb.w * this.fb.h * 8 * this.fb.s;
    return b;
  },
  vaoE() { const H = this.H; if (!H.vaoE || H.vaoEg !== H.gen) { H.vaoE = H.gl.createVertexArray(); H.vaoEg = H.gen; } return H.vaoE; },
  common(p) {
    const gl = this.H.gl, u = p.u;
    gl.uniform3fv(u.uL, L1); if (u.uL2) gl.uniform3fv(u.uL2, L2); if (u.uEye) gl.uniform4fv(u.uEye, this.cam.eye);
    if (u.uCapA) { gl.uniform4fv(u.uCapA, this.caps); gl.uniform3fv(u.uCapB, this.capB); }
  },
  restored() { this.fb = null; this.q = []; },
  msaa(gl, w, h) {
    const H = this.H, f = this.fb;
    if (f && f.w === w && f.h === h && this.fbGen === H.gen) return f;
    if (f && this.fbGen === H.gen) { gl.deleteFramebuffer(f.fb); gl.deleteRenderbuffer(f.c); gl.deleteRenderbuffer(f.d); }
    const o = { w, h, s: H.samples, fb: gl.createFramebuffer(), c: gl.createRenderbuffer(), d: gl.createRenderbuffer() };
    gl.bindRenderbuffer(gl.RENDERBUFFER, o.c); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, o.s, gl.RGBA8, w, h);
    gl.bindRenderbuffer(gl.RENDERBUFFER, o.d); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, o.s, gl.DEPTH_COMPONENT24, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, o.fb);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, o.c);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, o.d);
    this.fbGen = H.gen;
    return (this.fb = o);
  },
  /* sombra analítica: tres cápsulas a lo largo del eje de la herramienta */
  shadow(ts) {
    const c = this.caps, b = this.capB;
    c.fill(0); b.fill(0);
    if (!ts || !ts.pos) return;
    const tm = ts.h || ts.tool, caps = tm && tm.caps;
    if (!caps) return;
    const a = ts.axis ? norm(ts.axis) : [0, 0, 1], p = ts.pos;
    for (let i = 0; i < 3; i++) {
      const k = caps[i]; if (!(k[0] > 0)) continue;
      c[i * 4] = p[0] + a[0] * k[1]; c[i * 4 + 1] = p[1] + a[1] * k[1]; c[i * 4 + 2] = p[2] + a[2] * k[1]; c[i * 4 + 3] = k[0];
      b[i * 3] = p[0] + a[0] * k[2]; b[i * 3 + 1] = p[1] + a[1] * k[2]; b[i * 3 + 2] = p[2] + a[2] * k[2];
    }
  },
  timer(gl, begin) {
    const X = this.H.tq;
    if (!X) return;
    if (begin) {
      for (let i = this.q.length - 1; i >= 0; i--) {
        const q = this.q[i];
        if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) continue;
        if (!gl.getParameter(X.GPU_DISJOINT_EXT)) this.gpuMs = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
        gl.deleteQuery(q); this.q.splice(i, 1);
      }
      if (this.q.length < 3) { const q = gl.createQuery(); gl.beginQuery(X.TIME_ELAPSED_EXT, q); this.q.push(q); this.qOn = true; }
    } else if (this.qOn) { gl.endQuery(X.TIME_ELAPSED_EXT); this.qOn = false; }
  },
  /* estado canónico, pintado, MSAA y copia al lienzo 2D en la misma tarea */
  frame(list, o) {
    const H = this.H, gl = H.gl, v = this.view, pw = v.pw | 0, ph = v.ph | 0, t0 = now();
    if (H.lost || this.disposed || !pw || !ph || gl.isContextLost()) return false;
    o = o || {};
    H.size(this, pw, ph, t0);
    for (const it of list) if (it && it.h && it.h.live && it.h.live() && it.h.sync) it.h.sync(gl);
    const t1 = now();
    this.timer(gl, true);
    const ms = v.msaa && H.samples > 1 && v.tier !== 'C' ? this.msaa(gl, pw, ph) : null;
    gl.bindFramebuffer(gl.FRAMEBUFFER, ms ? ms.fb : null);
    gl.bindVertexArray(null);
    gl.viewport(0, 0, pw, ph); gl.enable(gl.SCISSOR_TEST); gl.scissor(0, 0, pw, ph);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
    gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.colorMask(true, true, true, true);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.cam.update(v.w, v.h);
    this.shadow(o.toolShadow);
    for (const it of list) {
      const h = it && it.h; if (!h || !h.g) continue;
      if (h instanceof Terrain) h.draw(gl, this, it);
      else if (h instanceof Mesh) { const w = WIRE[it.mode]; if (w || (it.alpha == null ? 1 : it.alpha) * h.alpha >= 1) h.surf(gl, this, it, w); }
      else if (h instanceof ToolMesh && (it.alpha == null || it.alpha >= 1)) h.draw(gl, this, it, 0);
    }
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    for (const it of list) {
      const h = it && it.h; if (!h || !h.g) continue;
      if (h instanceof Lines || h instanceof Vectors) h.draw(gl, this, it);
      else if (h instanceof Mesh && (it.mode === 'edges' || it.mode === 'hidden' || it.edges)) h.edges(gl, this, it);
    }
    for (const it of list) {
      const h = it && it.h; if (!h || !h.g) continue;
      if (h instanceof Mesh && !WIRE[it.mode] && (it.alpha == null ? 1 : it.alpha) * h.alpha < 1) h.surf(gl, this, it, false);
      else if (h instanceof ToolMesh) { if (it.alpha != null && it.alpha < 1) h.draw(gl, this, it, 0); h.draw(gl, this, it, 1); }
    }
    gl.depthMask(true); gl.disable(gl.BLEND); gl.bindVertexArray(null);
    if (ms) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, ms.fb); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      gl.blitFramebuffer(0, 0, pw, ph, 0, 0, pw, ph, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    this.timer(gl, false);
    const t2 = now(), c = this.ctx;
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(H.cv, 0, H.cv.height - ph, pw, ph, v.ox, v.oy, pw, ph);
    c.restore();
    const t3 = now();
    this.copyMs = t3 - t2;
    const m = this.ms; m.sync = t1 - t0; m.draw = t2 - t1; m.copy = t3 - t2; m.total = t3 - t0;
    return true;
  },
  project(p, out) {
    const v = this.view, q = xfv(this.cam.update(v.w, v.h).VP, p[0], p[1], p[2], this.cam.t4), r = out || [0, 0];
    r[0] = (q[0] / q[3] * 0.5 + 0.5) * v.w; r[1] = (0.5 - q[1] / q[3] * 0.5) * v.h;
    if (r.length > 2) r[2] = q[2] / q[3];
    return r;
  },
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const H = this.H, gl = H.gl;
    for (const r of this.res.slice()) r.dispose();
    if (this.fb && this.fbGen === H.gen && !H.lost) { gl.deleteFramebuffer(this.fb.fb); gl.deleteRenderbuffer(this.fb.c); gl.deleteRenderbuffer(this.fb.d); }
    this.fb = null;
    const i = H.scenes.indexOf(this); if (i >= 0) H.scenes.splice(i, 1);
  }
};

C.GL = { hub, VERSION: '1.2.0', pose: (pos, axis, o) => poseTo(o || new Float32Array(16), pos, axis) };
})(globalThis);
