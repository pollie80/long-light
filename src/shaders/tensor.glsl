// Structure tensor of the image: tells the paint filter which way strokes should run.
varying vec2 vUv;
uniform sampler2D t;
uniform vec2 px;
void main() {
  vec3 a = texture2D(t, vUv + vec2(-px.x, -px.y)).rgb;
  vec3 b = texture2D(t, vUv + vec2(0.0, -px.y)).rgb;
  vec3 c = texture2D(t, vUv + vec2(px.x, -px.y)).rgb;
  vec3 d = texture2D(t, vUv + vec2(-px.x, 0.0)).rgb;
  vec3 f = texture2D(t, vUv + vec2(px.x, 0.0)).rgb;
  vec3 g = texture2D(t, vUv + vec2(-px.x, px.y)).rgb;
  vec3 h = texture2D(t, vUv + vec2(0.0, px.y)).rgb;
  vec3 i = texture2D(t, vUv + vec2(px.x, px.y)).rgb;
  vec3 sx = (-a - 2.0 * d - g + c + 2.0 * f + i) * 0.25;
  vec3 sy = (-a - 2.0 * b - c + g + 2.0 * h + i) * 0.25;
  gl_FragColor = vec4(dot(sx, sx), dot(sy, sy), dot(sx, sy), 1.0);
}
