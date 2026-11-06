// Combines scene, bloom and god rays, tonemaps, and applies the storybook colour grade.
varying vec2 vUv;
uniform sampler2D c;
uniform sampler2D bloom;
uniform sampler2D rays;
uniform float uBloom;
uniform float uExposure;
uniform float uSat;
uniform float uWarmth;
uniform float uNight;
uniform vec3 uShadowTint;

vec3 acesFit(vec3 x) {
  return sat((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14));
}
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 toSRGB(vec3 x) {
  return mix(x * 12.92, 1.055 * pow(max(x, vec3(1e-5)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, x));
}

void main() {
  vec3 col = texture2D(c, vUv).rgb;
  vec3 bl = texture2D(bloom, vUv).rgb;
  vec3 ra = texture2D(rays, vUv).rgb;
  col = mix(col, bl, sat(uBloom * 0.105));
  col += ra;
  col *= uExposure * 0.62;

  // Blend a hue-preserving curve into ACES, so an orange sky stays rich rather than bleaching yellow.
  float l = max(luma(col), 1e-4);
  float tl = acesFit(vec3(l)).r;
  vec3 hp = sat(col * tl / l);
  vec3 tm = mix(acesFit(col), hp, 0.6);

  // Saturation, weighted so already vivid colours do not clip and shadows stay pigment-rich.
  float g = luma(tm);
  vec3 satd = mix(vec3(g), tm, uSat);
  tm = mix(tm, satd, 1.0 - 0.35 * smoothstep(0.75, 1.0, g));

  // Split tone: warm light, cool violet shadow. A painter's palette, not a camera's.
  float shadowAmt = sqr(1.0 - sat(g * 1.7));
  float highAmt = smoothstep(0.42, 1.0, g);
  vec3 tint = uShadowTint / max(max(uShadowTint.r, max(uShadowTint.g, uShadowTint.b)), 1e-3);
  tm = mix(tm, tm * mix(vec3(1.0), tint, 0.55), shadowAmt * (0.25 + 0.55 * uWarmth));
  tm *= mix(vec3(1.0), vec3(1.08, 1.0, 0.86), highAmt * (0.12 + 0.55 * uWarmth));

  // Lifted blacks, like pigment on paper: nothing is ever pure black.
  tm = tm * 0.965 + vec3(0.016, 0.013, 0.026);

  vec3 d = toSRGB(sat(tm));
  // Gentle S-curve in display space.
  d = mix(d, d * d * (3.0 - 2.0 * d), 0.28);
  gl_FragColor = vec4(d, 1.0);
}
