// The bay. Reflection is real, waves come from a spectrum rebaked each frame, ripples from a simulation.
varying vec3 vP;
varying float vViewZ;
uniform sampler2D uScene;
uniform sampler2D uDepth;
uniform sampler2D uReflect;
uniform sampler2D uWaves;
uniform sampler2D uRipple;
uniform mat4 uReflectVP;
uniform vec4 uRippleRect;
uniform vec3 uScatter;
uniform vec2 uRes;
uniform float uNearZ;
uniform float uFarZ;
uniform float uGlow;
uniform vec3 uLanternPos;
uniform vec3 uLanternCol;
uniform vec4 uMagic[6];
uniform float uMagicAmt;

float linearZ(float d) { return (uNearZ * uFarZ) / (uFarZ - d * (uFarZ - uNearZ)); }

vec3 waveSample(vec2 uv, float k, out float h) {
  vec4 s = texture2D(uWaves, uv);
  h = s.b;
  return vec3(s.r * k, s.g * k, s.a);
}

void main() {
  vec3 V = cameraPosition - vP;
  float dist = length(V);
  V /= dist;
  vec2 xz = vP.xz;

  // Three scales of the same live spectrum, rotated so the tiling never lines up.
  mat2 r1 = mat2(0.80, 0.60, -0.60, 0.80);
  mat2 r2 = mat2(0.36, -0.93, 0.93, 0.36);
  float h1, h2, h3;
  vec3 w1 = waveSample(xz / 32.0, 1.0, h1);
  vec3 w2 = waveSample(r1 * xz / 11.3, 0.55, h2);
  vec3 w3 = waveSample(r2 * xz / 96.0, 1.25, h3);
  vec2 slope = w1.xy + w2.xy + w3.xy;
  float curl = w1.z + w2.z * 0.6;

  // Ripples and wakes.
  vec2 ruv = (xz - uRippleRect.xy) / uRippleRect.zw + 0.5;
  float inR = step(0.0, ruv.x) * step(ruv.x, 1.0) * step(0.0, ruv.y) * step(ruv.y, 1.0);
  float rEdge = smoothstep(0.5, 0.42, max(abs(ruv.x - 0.5), abs(ruv.y - 0.5)));
  vec4 rip = texture2D(uRipple, ruv);
  float e = 1.0 / 512.0;
  vec2 ripSlope = vec2(
    texture2D(uRipple, ruv + vec2(e, 0.0)).r - texture2D(uRipple, ruv - vec2(e, 0.0)).r,
    texture2D(uRipple, ruv + vec2(0.0, e)).r - texture2D(uRipple, ruv - vec2(0.0, e)).r);
  slope += ripSlope * 7.0 * inR * rEdge;

  // Distance calm: little waves average out, the far bay is a mirror with long streaks.
  float calm = mix(1.0, 0.42, smoothstep(40.0, 900.0, dist));
  vec3 N = normalize(vec3(-slope.x * calm, 1.0, -slope.y * calm));

  // Fresnel, with the minimum raised: a storybook sea reflects more than a real one.
  float ndv = sat(dot(N, V));
  float F = 0.05 + 0.95 * pow(1.0 - ndv, 4.2);

  // Reflection: distort along the normal, and smear vertically, as water really stretches light.
  vec4 rc = uReflectVP * vec4(xz.x, 0.0, xz.y, 1.0);
  vec2 ruvR = rc.xy / rc.w * 0.5 + 0.5;
  float grazing = pow(1.0 - sat(V.y), 2.0);
  vec2 offs = vec2(N.x, N.z) * vec2(0.075, 0.20 + 0.34 * grazing);
  float lodR = 0.6 + grazing * 0.8;
  vec3 refl = textureLod(uReflect, sat(ruvR + offs), lodR).rgb * 0.34;
  refl += textureLod(uReflect, sat(ruvR + offs * 0.5 + vec2(0.0, 0.009)), lodR).rgb * 0.22;
  refl += textureLod(uReflect, sat(ruvR + offs * 1.6 - vec2(0.0, 0.012)), lodR).rgb * 0.22;
  refl += textureLod(uReflect, sat(ruvR + offs * 2.3 + vec2(0.0, 0.022)), lodR + 1.0).rgb * 0.22;

  // Looking into the water.
  vec2 suv = gl_FragCoord.xy / uRes;
  vec2 refrOff = N.xz * vec2(0.035, 0.05) / (1.0 + dist * 0.03);
  float dA = linearZ(texture2D(uDepth, suv + refrOff).r);
  if (dA < vViewZ) { refrOff = vec2(0.0); dA = linearZ(texture2D(uDepth, suv).r); }
  vec3 under = texture2D(uScene, suv + refrOff).rgb;
  float pathLen = max(dA - vViewZ, 0.0) * dist / max(vViewZ, 0.01);
  pathLen = min(pathLen, 60.0);
  // Red leaves first, then green: shallows glow teal, deep water closes to the scatter colour.
  vec3 absorb = vec3(0.42, 0.11, 0.075);
  vec3 T = exp(-absorb * pathLen);
  float sh = keyShadow(vP, vec3(0.0, 1.0, 0.0));
  float cs = cloudShade(vP);
  vec3 skyTop = textureLod(uSkyLow, panoUV(vec3(0.0, 1.0, 0.0)), 5.0).rgb;
  vec3 scat = uScatter * (0.55 + 0.6 * sh * cs * sat(uKeyDir.y * 1.5 + 0.25)) + skyTop * uScatter * 0.8;
  // Sub-surface glow where a low sun passes through the backs of waves.
  float waveBack = sat(curl * 2.4 + 0.25) * pow(sat(dot(-V, uKeyDir) * 0.5 + 0.5), 3.0);
  scat += uKeyCol * uScatter * waveBack * 0.28;
  vec3 body = under * T + scat * (1.0 - T);

  // Caustic shimmer on shallow sand.
  float shallow = exp(-pathLen * 0.55);
  vec2 cq = xz * 0.45 + vec2(uTime * 0.09, -uTime * 0.07);
  float caust = texture2D(uNoise, cq).b * texture2D(uNoise, cq * 1.31 + vec2(-uTime * 0.06, uTime * 0.05)).b;
  body += uKeyCol * smoothstep(0.34, 0.56, caust) * shallow * sh * 0.16 * sat(uKeyDir.y * 2.0);

  vec3 col = mix(body, refl, F);

  // Sun or moon glitter: narrow broken flecks that a painter would dab on with a loaded brush.
  vec3 Ng = normalize(vec3(-slope.x * 1.65, 1.0, -slope.y * 1.65));
  vec3 R = reflect(-V, Ng);
  float sd = sat(dot(R, uKeyDir));
  float tight = pow(sd, 620.0);
  float wide = pow(sd, 90.0);
  float sparkN = texture2D(uNoise, xz * 0.9 + vec2(uTime * 0.11, uTime * 0.07)).r;
  float spark = smoothstep(0.62, 0.8, sparkN);
  vec3 keyL = uKeyCol / max(max(uKeyCol.r, max(uKeyCol.g, uKeyCol.b)), 0.001);
  float keyMag = length(uKeyCol);
  col += keyL * keyMag * (tight * 9.0 + wide * 0.34 * (0.2 + spark * 1.3)) * sh * cs * smoothstep(-0.015, 0.03, uKeyDir.y);

  // Foam at the shore and around posts and hulls, from real scene depth.
  float raw = linearZ(texture2D(uDepth, suv).r);
  float vert = max(raw - vViewZ, 0.0) * max(V.y, 0.08) * dist / max(vViewZ, 0.01);
  float lap = 0.5 + 0.5 * sin(uTime * 0.55 + (h1 + h3) * 2.0);
  float noiseF = texture2D(uNoise, xz * 0.55 + vec2(uTime * 0.02, 0.0)).b;
  float line = smoothstep(0.11 + 0.12 * lap, 0.0, vert) * smoothstep(0.32, 0.6, noiseF + 0.12);
  float band = sin((vert + 0.09 * lap) * 22.0 + noiseF * 5.0) * 0.5 + 0.5;
  float line2 = smoothstep(0.42, 0.13, vert) * smoothstep(0.75, 0.97, band) * smoothstep(0.35, 0.6, noiseF);
  float foam = sat(line + line2 * 0.5);

  // Wake foam from the simulation, fading as it spreads.
  float wake = sat(rip.b) * inR * rEdge;
  foam = max(foam, wake * smoothstep(0.25, 0.6, noiseF + wake * 0.35));

  vec3 foamLit = uKeyCol * 0.3 * sh * sat(uKeyDir.y + 0.35) + textureLod(uSkyLow, panoUV(vec3(0.0, 1.0, 0.0)), 5.0).rgb * uAmb * 0.9;
  col = mix(col, foamLit * vec3(1.0, 0.98, 0.94), foam * 0.82);

  // The sea glows at night behind anything that disturbs it.
  if (uGlow > 0.001) {
    float en = sat(rip.a) * inR * rEdge;
    float sparks = smoothstep(0.35, 0.75, texture2D(uNoise, xz * 1.7 + uTime * 0.03).r);
    col += vec3(0.08, 0.62, 0.78) * en * (0.35 + sparks * 1.6) * uGlow * 2.6;
  }

  // Pools where the water itself is awake at night: veins of slow light, sparks and a soft aura.
  if (uMagicAmt > 0.001) {
    for (int i = 0; i < 6; i++) {
      vec2 rel = xz - uMagic[i].xy;
      float rd = length(rel) / uMagic[i].z;
      if (rd >= 1.0) continue;
      float fall = sqr(1.0 - rd);
      float ang = uTime * 0.045 + rd * 2.4 + float(i);
      float ca = cos(ang);
      float sa = sin(ang);
      vec2 q = vec2(rel.x * ca - rel.y * sa, rel.x * sa + rel.y * ca) * 0.05;
      float n1 = texture2D(uNoise, q + float(i) * 0.37).a;
      float n2 = texture2D(uNoise, q * 2.6 - uTime * 0.008).r;
      float veins = smoothstep(0.6, 0.86, n1 * 0.72 + n2 * 0.42);
      float sp = smoothstep(0.7, 0.92, texture2D(uNoise, xz * 1.3 + uTime * 0.018).b);
      vec3 tint = magicTint(fract(uMagic[i].w + n2 * 0.22));
      float pulse = 0.72 + 0.28 * sin(uTime * 0.6 + float(i) * 2.1);
      col += tint * (fall * 0.34 * pulse + veins * pow(1.0 - rd, 1.2) * 1.5 * pulse + sp * fall * 1.5) * uMagicAmt;
    }
    // The shoreline wakes as well, faintly, wherever foam breaks.
    float shoreSp = smoothstep(0.55, 0.85, texture2D(uNoise, xz * 1.1 + vec2(uTime * 0.03, 0.0)).r);
    col += vec3(0.1, 0.72, 0.85) * foam * (0.22 + shoreSp * 1.1) * uMagicAmt;
  }

  // Lantern light pooled on the surface around the boat.
  if (uLanternCol.x + uLanternCol.y + uLanternCol.z > 0.001) {
    vec3 d = uLanternPos - vP;
    float d2 = dot(d, d);
    float att = sqr(sat(1.0 - d2 / 196.0)) / (1.0 + d2 * 0.18);
    float gl = pow(sat(dot(normalize(V + normalize(d)), N)), 150.0);
    col += uLanternCol * att * (0.05 + gl * 2.8);
  }

  col = applyFog(col, vP);
  gl_FragColor = vec4(col, 1.0);
}
