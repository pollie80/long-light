// Anisotropic Kuwahara filter with polynomial sector weights (Kyprianidis et al.).
// Each pixel takes the colour of whichever nearby stroke-shaped sector is most uniform, so edges stay
// crisp while flat regions turn into dabs of paint running along the form.
varying vec2 vUv;
uniform sampler2D t;
uniform sampler2D tfm;
uniform sampler2D depth;
uniform vec2 px;
uniform float uRadius;
uniform float uNear;
uniform float uFar;

void main() {
  vec3 st = texture2D(tfm, vUv).xyz;
  float E = st.x, G = st.y, F = st.z;
  float root = sqrt(sqr(E - G) + 4.0 * F * F);
  float l1 = 0.5 * (E + G + root);
  float l2 = 0.5 * (E + G - root);
  vec2 v = vec2(l1 - E, -F);
  float phi = dot(v, v) > 1e-10 ? atan(v.y, v.x) : 0.0;
  float A = (l1 + l2) > 1e-8 ? (l1 - l2) / (l1 + l2) : 0.0;

  // Strokes are finer up close and broader in the distance, as in a real painting.
  float z = texture2D(depth, vUv).r;
  float viewZ = (uNear * uFar) / (uFar - z * (uFar - uNear));
  float nearFine = mix(0.55, 1.0, smoothstep(2.0, 60.0, viewZ));

  float rad = max(uRadius * nearFine, 2.0);
  const float alpha = 1.0;
  float a = rad * clamp((alpha + A) / alpha, 0.1, 2.0);
  float b = rad * clamp(alpha / (alpha + A), 0.1, 2.0);
  float cp = cos(phi);
  float sp = sin(phi);
  mat2 SR = mat2(0.5 / a * cp, 0.5 / b * sp, 0.5 / a * -sp, 0.5 / b * cp);
  int mx = int(ceil(sqrt(a * a * cp * cp + b * b * sp * sp)));
  int my = int(ceil(sqrt(a * a * sp * sp + b * b * cp * cp)));

  float zeta = 2.0 / rad;
  const float zc = 0.58;
  float sinZc = sin(zc);
  float eta = (zeta + cos(zc)) / (sinZc * sinZc);

  vec4 m[8];
  vec3 s[8];
  for (int k = 0; k < 8; k++) { m[k] = vec4(0.0); s[k] = vec3(0.0); }

  for (int y = -my; y <= my; y++) {
    for (int x = -mx; x <= mx; x++) {
      if (((x + y) & 1) != 0) continue;
      vec2 p = SR * vec2(float(x), float(y));
      if (dot(p, p) > 0.25) continue;
      vec3 c = texture2D(t, vUv + vec2(float(x), float(y)) * px).rgb;
      float w[8];
      float sum = 0.0;
      float vxx = zeta - eta * p.x * p.x;
      float vyy = zeta - eta * p.y * p.y;
      float zz;
      zz = max(0.0, p.y + vxx);  w[0] = zz * zz; sum += w[0];
      zz = max(0.0, -p.x + vyy); w[2] = zz * zz; sum += w[2];
      zz = max(0.0, -p.y + vxx); w[4] = zz * zz; sum += w[4];
      zz = max(0.0, p.x + vyy);  w[6] = zz * zz; sum += w[6];
      vec2 q = 0.70710678 * vec2(p.x - p.y, p.x + p.y);
      vxx = zeta - eta * q.x * q.x;
      vyy = zeta - eta * q.y * q.y;
      zz = max(0.0, q.y + vxx);  w[1] = zz * zz; sum += w[1];
      zz = max(0.0, -q.x + vyy); w[3] = zz * zz; sum += w[3];
      zz = max(0.0, -q.y + vxx); w[5] = zz * zz; sum += w[5];
      zz = max(0.0, q.x + vyy);  w[7] = zz * zz; sum += w[7];
      float g = exp(-3.125 * dot(p, p)) / sum;
      for (int k = 0; k < 8; k++) {
        float wk = w[k] * g;
        m[k] += vec4(c * wk, wk);
        s[k] += c * c * wk;
      }
    }
  }

  vec4 outCol = vec4(0.0);
  for (int k = 0; k < 8; k++) {
    if (m[k].w <= 0.0) continue;
    vec3 mean = m[k].rgb / m[k].w;
    vec3 var = abs(s[k] / m[k].w - mean * mean);
    float sigma2 = var.r + var.g + var.b;
    float wgt = 1.0 / (1.0 + pow(9000.0 * sigma2, 4.0));
    outCol += vec4(mean * wgt, wgt);
  }
  gl_FragColor = vec4(outCol.w > 1e-24 ? sat(outCol.rgb / outCol.w) : texture2D(t, vUv).rgb, 1.0);
}
