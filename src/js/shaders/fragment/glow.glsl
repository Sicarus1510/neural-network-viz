uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform float uIntensity;

varying vec2 vUv;

#define SAMPLES 32
#define GLOW_RADIUS 0.02

void main() {
    vec4 color = texture2D(tDiffuse, vUv);
    vec4 glow = vec4(0.0);
    
    // Radial blur for glow effect
    for(int i = 0; i < SAMPLES; i++) {
        float angle = float(i) * 3.14159265 * 2.0 / float(SAMPLES);
        vec2 offset = vec2(cos(angle), sin(angle)) * GLOW_RADIUS;
        glow += texture2D(tDiffuse, vUv + offset);
    }
    
    glow /= float(SAMPLES);
    glow *= uIntensity;
    
    // Combine original and glow
    gl_FragColor = color + glow;
}