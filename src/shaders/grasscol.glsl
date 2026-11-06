// Shared by the terrain and the grass blades, so blades grow out of ground of the same colour.
vec3 hexv(float r, float g, float b) { return pow(vec3(r, g, b) / 255.0, vec3(2.2)); }

vec3 grassColor(vec2 xz, float lod) {
  float n1 = textureLod(uNoise, xz * 0.0065, lod).r;
  float n2 = textureLod(uNoise, xz * 0.031, lod).g;
  float n3 = textureLod(uNoise, xz * 0.17, lod).r;
  vec3 a = hexv(98.0, 128.0, 58.0);
  vec3 b = hexv(142.0, 148.0, 66.0);
  vec3 c = hexv(62.0, 100.0, 66.0);
  vec3 d = hexv(176.0, 152.0, 86.0);
  vec3 g = mix(a, b, smoothstep(0.3, 0.72, n2));
  g = mix(g, c, smoothstep(0.42, 0.72, n1) * 0.85);
  g = mix(g, d, smoothstep(0.58, 0.82, n3 * 0.6 + n2 * 0.5) * 0.65);
  return g;
}
