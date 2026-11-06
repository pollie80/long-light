// Last pass: makes the paint sit on something. Bristle relief along the strokes, canvas weave,
// pigment grain, and soft worn edges.
varying vec2 vUv;
uniform sampler2D t;
uniform sampler2D tfm;
uniform sampler2D noise;
uniform vec2 px;
uniform float uStrength;
uniform float uVignette;
uniform float uFade;
uniform float uTime;

vec2 flowAt(vec2 uv) {
  vec3 st = texture2D(tfm, uv).xyz;
  float E = st.x, G = st.y, F = st.z;
  float root = sqrt(sqr(E - G) + 4.0 * F * F);
  float l1 = 0.5 * (E + G + root);
  vec2 v = vec2(l1 - E, -F);
  float len = length(v);
  // Calm areas have no edges to follow, so strokes wander on a slow field, like a painter's hand.
  float ang = texture2D(noise, uv * vec2(1.6, 1.6 * px.y / px.x)).g * TAU * 1.6;
  vec2 wander = vec2(cos(ang), sin(ang));
  float coh = smoothstep(0.0004, 0.006, l1);
  vec2 d = len > 1e-5 ? v / len : wander;
  return normalize(mix(wander, d, coh) + 1e-4);
}

// Line integral along the stroke direction: noise smeared the way a bristle would drag it.
float bristle(vec2 uv) {
  vec2 aspect = vec2(1.0, px.x / px.y);
  float s = 0.0;
  vec2 p = uv;
  vec2 dir = flowAt(uv);
  for (int i = 0; i < 5; i++) {
    s += texture2D(noise, p * vec2(1.0, px.y / px.x) * 1.35).a;
    dir = flowAt(p);
    p += dir * px * 3.0;
  }
  p = uv;
  dir = -flowAt(uv);
  for (int i = 0; i < 4; i++) {
    p += dir * px * 3.0;
    dir = -flowAt(p);
    s += texture2D(noise, p * vec2(1.0, px.y / px.x) * 1.35).a;
  }
  return s / 9.0;
}

vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }

void main() {
  vec3 col = texture2D(t, vUv).rgb;
  float st = uStrength;

  // Impasto: read a height from the bristle pattern and the paint's own value, then light it softly.
  float h0 = bristle(vUv);
  vec2 grad = vec2(dFdx(h0), dFdy(h0)) * 1.5;
  float relief = dot(grad, normalize(vec2(-0.7, 0.7)));
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col *= 1.0 + relief * 0.85 * st * (0.55 + lum * 0.6);

  // Pigment density varies with the bristle pattern: broken colour within a stroke.
  col *= 1.0 + (h0 - 0.5) * 0.09 * st;

  // Canvas weave.
  vec2 fc = gl_FragCoord.xy;
  float weave = sin(fc.x * 1.25) * sin(fc.y * 1.25 + sin(fc.x * 0.11) * 0.6);
  float slub = texture2D(noise, vUv * vec2(1.0, px.y / px.x) * 0.9).g - 0.5;
  col *= 1.0 + weave * 0.012 * st + slub * 0.035 * st;

  // Fine paper tooth in the lights.
  float tooth = hash12(fc) - 0.5;
  col += tooth * 0.012 * st;

  // Worn vignette, warm and uneven rather than a clean circle.
  vec2 q = vUv - 0.5;
  float edgeNoise = texture2D(noise, vUv * 1.4).r * 0.11;
  float vig = smoothstep(0.42, 0.92, length(q * vec2(1.0, 0.86)) + edgeNoise);
  col *= mix(vec3(1.0), vec3(0.74, 0.66, 0.72), vig * uVignette * 1.9);

  // Screen fade used for transitions: fades towards warm paper dark.
  col = mix(col, vec3(0.045, 0.035, 0.055), uFade);
  gl_FragColor = vec4(sat(col), 1.0);
}
