// The painted lighting model. Every lit surface in the game goes through litSurface + applyFog.
uniform float uTime;
uniform vec3 uKeyDir;
uniform vec3 uKeyCol;
uniform vec3 uShadowTint;
uniform vec3 uBounce;
uniform float uAmb;
uniform float uFog;
uniform float uMist;
uniform float uWarmth;
uniform float uNight;
uniform float uClip;
uniform sampler2D uSkyLow;
uniform sampler2D uNoise;
uniform sampler2D uShadow0;
uniform sampler2D uShadow1;
uniform mat4 uShadowM0;
uniform mat4 uShadowM1;
uniform float uShadowOn;
uniform vec4 uCloudShade;
uniform vec4 uPL[10];
uniform vec3 uPLC[10];

void clipBelowWater(vec3 p) {
  if (uClip > 0.5 && p.y < 0.0) discard;
}

float sampleShadow(sampler2D map, vec3 uvz, float radius, float bias, float rot, int N) {
  float s = 0.0;
  float c = cos(rot);
  float d = sin(rot);
  for (int i = 0; i < N; i++) {
    float a = float(i) * 2.399963;
    float r = sqrt((float(i) + 0.5) / float(N));
    vec2 o = vec2(cos(a), sin(a)) * r;
    o = vec2(o.x * c - o.y * d, o.x * d + o.y * c);
    float z = texture2D(map, uvz.xy + o * radius).r;
    s += step(uvz.z - bias, z);
  }
  return s / float(N);
}

float keyShadow(vec3 P, vec3 N) {
  if (uShadowOn < 0.5) return 1.0;
  vec3 Pb = P + N * 0.06;
  float rot = ign(gl_FragCoord.xy) * TAU;
  vec4 a = uShadowM0 * vec4(Pb, 1.0);
  vec3 ua = a.xyz * 0.5 + 0.5;
  vec2 ea = abs(ua.xy - 0.5);
  float inNear = step(max(ea.x, ea.y), 0.49) * step(ua.z, 1.0);
  float near = 1.0;
  if (inNear > 0.5) near = sampleShadow(uShadow0, ua, 0.00055, 0.00035, rot, 7);
  float blend = inNear > 0.5 ? smoothstep(0.38, 0.48, max(ea.x, ea.y)) : 1.0;
  if (blend <= 0.0) return near;

  vec4 b = uShadowM1 * vec4(P + N * 0.45, 1.0);
  vec3 ub = b.xyz * 0.5 + 0.5;
  vec2 eb = abs(ub.xy - 0.5);
  float far = 1.0;
  if (max(eb.x, eb.y) < 0.495 && ub.z < 1.0) far = sampleShadow(uShadow1, ub, 0.00042, 0.00028, rot, 5);
  return mix(near, far, blend);
}

// Big soft cloud shadows drift over the land, giving the sense of weather passing.
float cloudShade(vec3 P) {
  vec2 q = P.xz * 6.0e-4 + uCloudShade.xy;
  float n = texture2D(uNoise, q).r * 0.65 + texture2D(uNoise, q * 2.3).g * 0.35;
  return mix(1.0, smoothstep(uCloudShade.z - 0.15, uCloudShade.z + 0.2, n), uCloudShade.w);
}

vec3 skyAmbient(vec3 N) {
  // Very blurred panorama: sky colour that really does come from the sky above this surface.
  vec3 dir = normalize(vec3(N.x, max(N.y, 0.0) + 0.25, N.z));
  vec3 a = textureLod(uSkyLow, panoUV(dir), 5.0).rgb;
  a = min(a, vec3(1.15));
  a = mix(vec3(dot(a, vec3(0.3, 0.55, 0.15))), a, 0.62);
  float up = N.y * 0.5 + 0.5;
  return mix(uBounce, a * 0.9, smoothstep(0.1, 0.8, up)) * uAmb;
}

vec3 pointLights(vec3 alb, vec3 N, vec3 P) {
  vec3 s = vec3(0.0);
  for (int i = 0; i < 10; i++) {
    vec3 c = uPLC[i];
    if (c.x + c.y + c.z < 0.001) continue;
    vec3 d = uPL[i].xyz - P;
    float d2 = dot(d, d);
    float r = uPL[i].w;
    float att = sqr(sat(1.0 - d2 / (r * r))) / (1.0 + d2 * 0.25);
    float nl = sat(dot(N, d / sqrt(max(d2, 1e-4))) * 0.75 + 0.25);
    s += c * att * nl;
  }
  return s * alb;
}

// sss: 0 for hard surfaces, 1 for leaves and grass where light comes through from behind.
vec3 litSurface(vec3 alb, vec3 N, vec3 P, float ao, float sss) {
  vec3 V = normalize(cameraPosition - P);
  float ndl = dot(N, uKeyDir);

  // Ragged terminator: the light edge wanders like a loaded brush, the core of the painted look.
  float jit = texture2D(uNoise, P.xz * 0.23 + P.y * 0.17).g - 0.5;
  float jit2 = texture2D(uNoise, P.xz * 1.1 + P.y * 0.9).r - 0.5;
  float wrapped = smoothstep(-0.08, 0.62, ndl + (jit * 0.34 + jit2 * 0.16));
  // A little posterisation of the light, as a painter mixes in discrete values.
  wrapped = mix(wrapped, floor(wrapped * 4.0 + 0.5) / 4.0, 0.3);

  float sh = keyShadow(P, N);
  float cs = cloudShade(P);
  vec3 key = uKeyCol * wrapped * sh * cs;

  // Shadows lean to violet rather than black.
  vec3 amb = skyAmbient(N);
  float shadowed = 1.0 - wrapped * sh;
  vec3 tint = mix(vec3(1.0), uShadowTint / max(max(uShadowTint.r, max(uShadowTint.g, uShadowTint.b)), 0.001), 0.42 * shadowed);
  amb *= tint;

  vec3 col = alb * (key * 0.28 + amb * ao);

  // Backlit translucency on leaves.
  if (sss > 0.0) {
    float back = pow(sat(dot(-V, uKeyDir) * 0.5 + 0.5), 4.0);
    float through = sat(-ndl * 0.5 + 0.5);
    col += alb * vec3(1.15, 1.05, 0.55) * uKeyCol * back * through * sss * sh * cs * 0.42;
  }

  // Warm rim that separates forms from the sky when the sun is low in front of the viewer.
  float rim = pow(1.0 - sat(dot(N, V)), 3.0);
  float toward = pow(sat(dot(-V, uKeyDir)), 2.0);
  col += uKeyCol * alb * rim * toward * sh * 0.4;

  col += pointLights(alb, N, P);
  return col;
}

vec3 applyFog(vec3 col, vec3 P) {
  vec3 d = P - cameraPosition;
  float dist = length(d);
  vec3 dir = d / max(dist, 0.001);
  // Height falloff: air is thicker near the water.
  float avgH = max((cameraPosition.y + P.y) * 0.5, 0.0);
  float dens = uFog * exp(-avgH * 0.012);
  float f = 1.0 - exp(-dist * dens);
  // Low ground mist, strongest at dawn.
  float mh = exp(-max(P.y, 0.0) * 0.14);
  f = max(f, (1.0 - exp(-dist * 0.0022 * uMist)) * mh);
  // The fog colour is the actual sky just above the horizon in this direction, so the land melts
  // into whatever is behind it, sun glow included.
  vec3 fogCol = textureLod(uSkyLow, panoUV(normalize(vec3(dir.x, 0.025 + max(dir.y, 0.0), dir.z))), 2.0).rgb;
  return mix(col, fogCol, f);
}
