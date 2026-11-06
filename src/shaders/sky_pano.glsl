// Renders the sky panorama: atmosphere, cirrus, altocumulus, volumetric cumulus.
// Alpha stores how much of space shows through, used to occlude sun, moon and stars.
precision highp sampler3D;

uniform sampler2D uTrans;
uniform sampler2D uNoise;
uniform sampler3D uCloud3D;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform float uSunI;
uniform float uMoonI;
uniform float uCloudTime;
uniform vec2 uWind;
uniform float uCover;
uniform float uCirrus;
uniform float uAlto;
uniform vec2 uSeed;
uniform vec3 uCloudTop;
uniform vec3 uCloudBot;
uniform float uNight;
uniform float uHero;
varying vec2 vUv;

const float Rg = 6360e3;
const float Rt = 6460e3;
const vec3 bR = vec3(5.802e-6, 13.558e-6, 33.1e-6);
const float bMs = 3.996e-6;
const float bMa = 4.4e-6;
const vec3 bO = vec3(0.650e-6, 1.881e-6, 0.085e-6);

vec3 extinction(float h) {
  return bR * exp(-h / 8000.0) + (bMs + bMa) * exp(-h / 1200.0) + bO * max(0.0, 1.0 - abs(h - 25000.0) / 15000.0);
}
vec3 transAt(float h, float mu) {
  float s = sign(mu) * sqrt(abs(mu));
  return texture2D(uTrans, vec2(0.5 + 0.5 * s, sqrt(clamp(h, 0.0, 1e5) / 1e5))).rgb;
}
float sphereFar(vec3 ro, vec3 rd, float R) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - R * R;
  float d = b * b - c;
  if (d < 0.0) return -1.0;
  return -b + sqrt(d);
}
float hg(float c, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * c, 1.5));
}

vec3 atmosphere(vec3 rd, vec3 L, float I) {
  vec3 ro = vec3(0.0, Rg + 40.0, 0.0);
  float tMax = sphereFar(ro, rd, Rt);
  const int N = 26;
  float mu = dot(rd, L);
  float pR = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
  // A tight lobe for the disc glow and a broad one that paints the big warm area around a low sun.
  float pM = hg(mu, 0.86) * 0.8 + hg(mu, 0.5) * 0.2;
  vec3 od = vec3(0.0);
  vec3 acc = vec3(0.0);
  vec3 ms = vec3(0.0);
  float prev = 0.0;
  for (int i = 0; i < N; i++) {
    float f = (float(i) + 1.0) / float(N);
    float t = tMax * f * f * f;
    float dt = t - prev;
    float tm = prev + dt * 0.5;
    prev = t;
    vec3 p = ro + rd * tm;
    float r = length(p);
    float h = r - Rg;
    vec3 e = extinction(h);
    od += e * dt * 0.5;
    vec3 Tv = exp(-od);
    od += e * dt * 0.5;
    vec3 rs = bR * exp(-h / 8000.0);
    float ms1 = bMs * 0.5 * exp(-h / 1200.0);
    vec3 Ts = transAt(h, dot(p / r, L));
    acc += Tv * Ts * (rs * pR + ms1 * pM) * dt;
    ms += Tv * (rs + ms1) * dt;
  }
  // Cheap multiple scattering: keeps twilight lavender instead of letting it fall to black.
  float msK = smoothstep(-0.22, 0.25, L.y);
  return I * (acc + ms * (0.018 + 0.03 * msK) * msK);
}

// Real twilight is multiple scattering, which a single-scatter model misses entirely. This paints it:
// ember at the horizon, then rose, violet and deep blue climbing the sky as the sun sinks.
vec3 twilightGlow(vec3 rd, vec3 L) {
  float dep = -L.y;
  float k = smoothstep(-0.15, 0.015, dep) * (1.0 - smoothstep(0.17, 0.33, dep));
  if (k <= 0.0) return vec3(0.0);
  vec2 a = normalize(rd.xz + 1e-4);
  vec2 b = normalize(L.xz + 1e-4);
  float side = sat(dot(a, b) * 0.5 + 0.5);
  float el = max(rd.y, 0.0);
  float span = 0.15 + clamp(dep, 0.0, 0.3) * 0.42;
  float h = el / span;
  vec3 gold = vec3(0.9, 0.55, 0.24);
  vec3 ember = vec3(1.0, 0.36, 0.1);
  vec3 rose = vec3(0.88, 0.27, 0.34);
  vec3 violet = vec3(0.34, 0.2, 0.58);
  vec3 deep = vec3(0.06, 0.095, 0.27);
  vec3 c = mix(gold, ember, smoothstep(0.0, 0.2, h));
  c = mix(c, rose, smoothstep(0.16, 0.62, h));
  c = mix(c, violet, smoothstep(0.55, 1.5, h));
  c = mix(c, deep, smoothstep(1.25, 4.0, h));
  // Sinks and dims with the sun, and the far side of the sky holds only a soft pink belt.
  float lobe = mix(0.16 + 0.42 * exp(-h * h * 3.0), 1.0, pow(side, 1.8));
  float fall = mix(1.0, 0.16, smoothstep(0.03, 0.26, dep));
  float glowUp = mix(1.0, 0.5, smoothstep(0.0, 3.0, h));
  return c * k * lobe * fall * glowUp * 1.02;
}

float cloudDensity(vec3 p, bool detail, vec3 viewDir) {
  float r = length(p + vec3(0.0, Rg, 0.0));
  float h = r - Rg;
  const float CB = 1050.0;
  const float CT = 5200.0;
  float hn = (h - CB) / (CT - CB);
  if (hn <= 0.0 || hn >= 1.0) return 0.0;

  vec2 q = p.xz + uWind * uCloudTime;
  vec4 w1 = texture2D(uNoise, q * 1.6e-5 + uSeed);
  vec4 w2 = texture2D(uNoise, q * 5.1e-5 - uSeed * 1.7);
  float cov = w1.r * 0.62 + w2.g * 0.5 - 0.06;

  // The hero cloud bank stands a little off the sunset azimuth, so the low sun rims it.
  float az = atan(p.z, p.x) + (w2.r - 0.5) * 0.7;
  float heroAz = abs(mod(az - 2.72 + PI, TAU) - PI);
  float dist = length(p.xz);
  float bank = uHero * (1.0 - smoothstep(0.1, 0.95, heroAz)) * smoothstep(8000.0, 22000.0, dist) * (1.0 - smoothstep(50000.0, 90000.0, dist));
  cov += bank * 0.2;
  // Keep a clean window low in the west, so the sun can sink into open sky under the clouds.
  float sunWin = (1.0 - smoothstep(0.08, 0.78, abs(mod(az - 2.98 + PI, TAU) - PI))) * smoothstep(5000.0, 16000.0, dist);
  cov -= sunWin * 0.62;

  float c = smoothstep(1.0 - uCover, 1.0 - uCover + 0.34, cov);
  if (c <= 0.0) return 0.0;

  // Height profile: flat-ish bellies, puffy tops, taller where coverage is denser.
  float topH = mix(0.28, 1.0, smoothstep(0.35, 0.95, c * (0.65 + 0.5 * w2.b)));
  float prof = smoothstep(0.0, 0.07, hn) * (1.0 - smoothstep(topH * 0.5, topH, hn));
  if (prof <= 0.0) return 0.0;

  // Domain warp gives the cauliflower its painted, billowing feel.
  vec3 s = vec3(q.x, h * 1.55, q.y);
  vec3 warp = texture(uCloud3D, s * 2.7e-5 + vec3(0.13, 0.31, 0.71)).rgb - 0.5;
  vec3 n = texture(uCloud3D, s * 1.15e-4 + warp * 0.13).rgb;
  float base = n.r * 0.62 + n.g * 0.38;
  float shaped = remap(base, 1.0 - c * prof, 1.0, 0.0, 1.0);
  if (shaped <= 0.0) return 0.0;
  if (detail) {
    // Cauliflower: rounded billows on the tops, wispier undersides.
    vec3 mf = texture(uCloud3D, s * 3.6e-4 + warp * 0.2).rgb;
    vec3 hf = texture(uCloud3D, s * 1.15e-3).rgb;
    float bil = mf.g * 0.72 + hf.g * 0.28;
    float ero = mix(1.0 - bil, bil, smoothstep(0.08, 0.4, hn));
    shaped = remap(shaped, ero * 0.68, 1.0, 0.0, 1.0);
  }
  // Tighten the edge so billows read as shapes rather than smoke.
  return smoothstep(0.015, 0.2, max(shaped, 0.0)) * 1.35;
}

float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec4 cumulus(vec3 rd, vec3 L, vec3 lightCol, float hazeK, vec3 hazeCol, vec3 ambTop, vec3 ambBot) {
  const float CB = 1050.0;
  const float CT = 5200.0;
  vec3 ro = vec3(0.0, Rg + 40.0, 0.0);
  float t0 = sphereFar(ro, rd, Rg + CB);
  float t1 = sphereFar(ro, rd, Rg + CT);
  if (t0 < 0.0 || t1 < 0.0) return vec4(0.0, 0.0, 0.0, 1.0);
  t1 = min(t1, min(t0 + 30000.0, 150000.0));
  if (t0 > 110000.0) return vec4(0.0, 0.0, 0.0, 1.0);

  const int STEPS = 96;
  float dt = (t1 - t0) / float(STEPS);
  float t = t0 + dt * hash12(gl_FragCoord.xy);
  float T = 1.0;
  vec3 acc = vec3(0.0);
  float cosT = dot(rd, L);
  float wT = 0.0;
  float tSum = 0.0;
  for (int i = 0; i < STEPS; i++) {
    if (T < 0.01) break;
    vec3 pw = rd * t + vec3(0.0, 40.0, 0.0);
    float d = cloudDensity(pw, true, rd);
    if (d > 0.002) {
      float sigma = 0.0105 * d;
      // Light march towards the key.
      float tau = 0.0;
      float ls = 170.0;
      float lt = 60.0;
      for (int j = 0; j < 6; j++) {
        vec3 lp = pw + L * (lt + ls * 0.5);
        tau += cloudDensity(lp, j < 3, rd) * ls;
        lt += ls;
        ls *= 1.55;
      }
      tau *= 0.0105;
      float r = length(pw + vec3(0.0, Rg, 0.0));
      float h = r - Rg;
      float hn = sat((h - CB) / (CT - CB));
      vec3 sunT = transAt(h, dot((pw + vec3(0.0, Rg, 0.0)) / r, L));
      // Three-octave multiple scattering approximation.
      float e = 0.0;
      float a = 1.0;
      float b = 1.0;
      float g = 0.72;
      for (int o = 0; o < 3; o++) {
        e += a * exp(-tau * b) * (hg(cosT, g) * 0.72 + hg(cosT, -0.22 * b) * 0.28);
        a *= 0.5;
        b *= 0.4;
        g *= 0.6;
      }
      float powder = 1.0 - 0.55 * exp(-tau * 2.4);
      vec3 sun = lightCol * sunT * e * powder * 3.2;
      // A low sun lights cloud bellies from underneath: the coral and rose of a real sunset.
      float under = (1.0 - smoothstep(0.0, 0.45, hn)) * (1.0 - smoothstep(0.02, 0.34, L.y));
      sun += lightCol * sunT * under * 0.5 * exp(-tau * 0.11) * vec3(1.0, 0.86, 0.9);
      // Bellies catch light bounced from the warm ground and sea, tops catch the sky.
      vec3 amb = mix(ambBot, ambTop, smoothstep(0.0, 0.75, hn));
      amb = mix(amb * vec3(0.5, 0.42, 0.68), amb, exp(-tau * 0.3));
      amb *= 0.82 + 0.34 * smoothstep(0.05, 0.6, hn);
      vec3 S = (sun + amb) * sigma;
      float tr = exp(-sigma * dt);
      vec3 Sint = (S - S * tr) / max(sigma, 1e-5);
      acc += T * Sint;
      tSum += t * T * sigma;
      wT += T * sigma;
      T *= tr;
    }
    t += dt;
  }
  if (wT > 0.0) {
    float avgT = tSum / wT;
    float keep = exp(-avgT / hazeK);
    acc = mix(hazeCol * (1.0 - T), acc, keep);
  }
  return vec4(acc, T);
}

float planeT(vec3 rd, float alt) {
  vec3 ro = vec3(0.0, Rg + 40.0, 0.0);
  return sphereFar(ro, rd, Rg + alt);
}

// High streaks that stay lit long after the ground has gone dark. Half of what makes a sunset.
vec4 cirrus(vec3 rd, vec3 L, vec3 lightCol, vec3 ambTop) {
  const float ALT = 9200.0;
  float t = planeT(rd, ALT);
  if (t < 0.0) return vec4(0.0);
  vec3 p = rd * t;
  vec2 q = p.xz + uWind * uCloudTime * 2.4;
  vec2 warp = texture2D(uNoise, q * 1.3e-5 + uSeed * 3.1).rg - 0.5;
  mat2 m = mat2(0.82, 0.57, -0.57, 0.82);
  vec2 st = m * q;
  float a = texture2D(uNoise, st * vec2(2.4e-5, 1.0e-5) + warp * 0.34).r;
  float b = texture2D(uNoise, st * vec2(1.25e-4, 2.1e-5) + warp * 0.5).a;
  float c = texture2D(uNoise, st * vec2(4.6e-4, 7.0e-5) + warp * 0.7).r;
  float streak = a * 0.7 + b * 0.42 + c * 0.17 - 0.55;
  float alpha = smoothstep(0.02, 0.42, streak + (uCirrus - 0.5) * 0.45) * smoothstep(0.0, 0.05, rd.y);
  alpha *= 0.62 * smoothstep(0.0, 0.62, uCirrus);
  float r = length(p + vec3(0.0, Rg, 0.0));
  vec3 sunT = transAt(ALT, dot((p + vec3(0.0, Rg, 0.0)) / r, L));
  float ph = hg(dot(rd, L), 0.6) * 1.1 + 0.16;
  vec3 col = lightCol * sunT * ph * 2.8 + ambTop * 0.5;
  return vec4(col, alpha);
}

// Mackerel sky: rippled mid-level cells, lit from below when the sun is low.
vec4 alto(vec3 rd, vec3 L, vec3 lightCol, vec3 ambTop, vec3 ambBot) {
  const float ALT = 5900.0;
  float t = planeT(rd, ALT);
  if (t < 0.0) return vec4(0.0);
  vec3 p = rd * t;
  vec2 q = p.xz + uWind * uCloudTime * 1.6;
  vec4 mask = texture2D(uNoise, q * 2.2e-5 - uSeed * 2.2);
  float gate = smoothstep(0.62 - uAlto * 0.32, 0.86 - uAlto * 0.32, mask.g * 0.65 + mask.r * 0.5);
  if (gate <= 0.0) return vec4(0.0);
  vec2 warp = texture2D(uNoise, q * 3.5e-5).rg - 0.5;
  vec2 st = q * 1.0 + warp * 8000.0;
  vec2 Lxz = normalize(L.xz + 1e-4);
  float n0 = texture2D(uNoise, st * vec2(0.9e-4, 1.5e-4)).b;
  float n1 = texture2D(uNoise, (st + Lxz * 500.0) * vec2(0.9e-4, 1.5e-4)).b;
  float det = texture2D(uNoise, st * 3.6e-4).r;
  float v = n0 * 0.8 + det * 0.28;
  float alpha = smoothstep(0.52, 0.84, v) * gate * smoothstep(0.015, 0.1, rd.y) * 0.7;
  float lit = sat(0.55 + (n0 - n1) * 3.4);
  float r = length(p + vec3(0.0, Rg, 0.0));
  vec3 sunT = transAt(ALT, dot((p + vec3(0.0, Rg, 0.0)) / r, L));
  float ph = hg(dot(rd, L), 0.55) * 0.9 + 0.2;
  vec3 col = lightCol * sunT * ph * mix(0.7, 3.2, lit) + mix(ambBot, ambTop, lit) * 0.5;
  return vec4(col, alpha);
}

void main() {
  vec3 rd = panoDir(vUv);
  rd.y = max(rd.y, 0.0008);
  rd = normalize(rd);

  bool useMoon = uSunDir.y < -0.19;
  vec3 L = useMoon ? uMoonDir : uSunDir;
  vec3 lightCol = useMoon ? vec3(0.42, 0.52, 0.78) * uMoonI : vec3(uSunI);
  float fadeSun = useMoon ? 1.0 : smoothstep(-0.19, -0.1, uSunDir.y);
  lightCol *= fadeSun;

  vec3 tw = twilightGlow(rd, uSunDir);
  vec3 sky = atmosphere(rd, uSunDir, uSunI) + tw;
  // Moonlit night sky: a deep painted blue that keeps the night readable.
  vec3 nightCol = mix(vec3(0.016, 0.026, 0.060), vec3(0.0035, 0.0075, 0.024), smoothstep(0.0, 0.5, rd.y));
  float moonGlow = pow(sat(dot(rd, uMoonDir)), 28.0) * 0.05 + pow(sat(dot(rd, uMoonDir)), 280.0) * 0.14;
  sky += uNight * (nightCol * 1.35 + vec3(0.42, 0.52, 0.78) * moonGlow);

  vec3 hazeDir = normalize(vec3(rd.x, max(rd.y * 0.35, 0.012), rd.z));
  vec3 hazeCol = atmosphere(hazeDir, uSunDir, uSunI) + uNight * nightCol * 1.35 + twilightGlow(hazeDir, uSunDir);

  // Cloud ambient follows the real brightness of the sky; the keyframes only choose its hue.
  vec3 skyUp = atmosphere(vec3(0.0, 1.0, 0.0), uSunDir, uSunI) + uNight * nightCol * 1.35 + twilightGlow(vec3(0.0, 1.0, 0.0), uSunDir) * 1.6;
  float level = lum(skyUp) * 1.5 + lum(hazeCol) * 0.35;
  vec3 ambTop = uCloudTop / max(lum(uCloudTop), 1e-3) * level;
  // Cloud bellies catch the glow of a low sun and go rose, rather than falling to brown.
  float lowSun = 1.0 - smoothstep(0.0, 0.34, uSunDir.y);
  vec3 ambBot = uCloudBot / max(lum(uCloudBot), 1e-3) * level * (1.45 + lowSun * 0.42);

  // A low sun steeps the whole sky in amber.
  float goldK = (1.0 - smoothstep(0.05, 0.46, uSunDir.y)) * smoothstep(-0.08, 0.02, uSunDir.y);
  sky *= mix(vec3(1.0), vec3(1.0, 0.72, 0.46), goldK * 0.8);
  ambTop *= mix(vec3(1.0), vec3(1.0, 0.68, 0.5), goldK * 0.75);
  sky = mix(vec3(lum(sky)), sky, 1.42);
  hazeCol = mix(vec3(lum(hazeCol)), hazeCol, 1.2);
  vec3 col = sky;
  float T = 1.0;

  vec4 ci = cirrus(rd, L, lightCol, ambTop);
  col = mix(col, ci.rgb, ci.a);
  T *= 1.0 - ci.a * 0.8;

  vec4 al = alto(rd, L, lightCol, ambTop, ambBot);
  col = mix(col, al.rgb, al.a);
  T *= 1.0 - al.a;

  vec4 cu = cumulus(rd, L, lightCol, 52000.0, hazeCol, ambTop, ambBot);
  // Clouds thin out into haze right at the horizon, so no grazing-ray banding shows.
  float horizonFade = smoothstep(0.02, 0.085, rd.y);
  cu.rgb *= horizonFade;
  cu.a = mix(1.0, cu.a, horizonFade);
  col = col * cu.a + cu.rgb;
  T *= cu.a;

  // One bad value here would spread through every mip and every reflection.
  if (any(isnan(col)) || any(isinf(col))) col = sky;
  if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);
  gl_FragColor = vec4(min(col, vec3(60.0)), isnan(T) ? 1.0 : T);
}
