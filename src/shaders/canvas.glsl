// Last pass: a soft, uneven vignette, and the fade used for transitions.
varying vec2 vUv;
uniform sampler2D t;
uniform sampler2D noise;
uniform float uVignette;
uniform float uFade;
uniform float uTime;

void main() {
  vec3 col = texture2D(t, vUv).rgb;

  // Worn vignette, warm and uneven rather than a clean circle.
  vec2 q = vUv - 0.5;
  float edgeNoise = texture2D(noise, vUv * 1.4).r * 0.11;
  float vig = smoothstep(0.42, 0.92, length(q * vec2(1.0, 0.86)) + edgeNoise);
  col *= mix(vec3(1.0), vec3(0.74, 0.66, 0.72), vig * uVignette * 1.9);

  // Screen fade used for transitions.
  col = mix(col, vec3(0.045, 0.035, 0.055), uFade);
  gl_FragColor = vec4(sat(col), 1.0);
}
