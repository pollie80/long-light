#define PI 3.141592653589793
#define TAU 6.283185307179586

float sat(float x) { return clamp(x, 0.0, 1.0); }
vec2 sat(vec2 x) { return clamp(x, 0.0, 1.0); }
vec3 sat(vec3 x) { return clamp(x, 0.0, 1.0); }
float sqr(float x) { return x * x; }
float remap(float v, float a, float b, float c, float d) { return c + (v - a) * (d - c) / (b - a); }

uint pcg1(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
float hash12(vec2 p) {
  uvec2 q = uvec2(ivec2(floor(p)) + 32768);
  return float(pcg1(q.x + pcg1(q.y))) / 4294967295.0;
}
vec2 hash22(vec2 p) {
  uvec2 q = uvec2(ivec2(floor(p)) + 32768);
  uint a = pcg1(q.x + pcg1(q.y));
  uint b = pcg1(a);
  return vec2(float(a), float(b)) / 4294967295.0;
}
vec3 hash33v(vec3 p) {
  uvec3 v = uvec3(ivec3(floor(p)) + 32768);
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return vec3(v) / 4294967295.0;
}
// Interleaved gradient noise: cheap screen-space dither.
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

// Sky panorama mapping: elevation is square-root warped so the horizon gets most of the texels.
vec2 panoUV(vec3 d) {
  float u = atan(d.z, d.x) / TAU + 0.5;
  float el = asin(clamp(d.y, 0.0, 1.0));
  return vec2(u, sqrt(el / (PI * 0.5)));
}
vec3 panoDir(vec2 uv) {
  float az = (uv.x - 0.5) * TAU;
  float el = uv.y * uv.y * PI * 0.5;
  return vec3(cos(az) * cos(el), sin(el), sin(az) * cos(el));
}

// The colours of the bay's magic: teal, through blue, to violet.
vec3 magicTint(float h) {
  vec3 a = mix(vec3(0.1, 0.86, 0.8), vec3(0.2, 0.42, 1.0), clamp(h * 2.0, 0.0, 1.0));
  return mix(a, vec3(0.74, 0.28, 1.0), clamp(h * 2.0 - 1.0, 0.0, 1.0));
}
