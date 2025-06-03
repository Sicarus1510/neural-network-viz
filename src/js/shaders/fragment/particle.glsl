uniform sampler2D uTexture;
uniform float uGlowIntensity;
uniform float uTime;

varying vec3 vColor;
varying float vOpacity;

void main() {
    // Get texture
    vec2 uv = gl_PointCoord;
    vec4 textureColor = texture2D(uTexture, uv);
    
    // Create circular particle
    float distanceToCenter = length(uv - vec2(0.5));
    float strength = 1.0 - smoothstep(0.0, 0.5, distanceToCenter);
    
    // Add glow effect
    float glow = exp(-distanceToCenter * 3.0) * uGlowIntensity;
    
    // Color with glow
    vec3 finalColor = vColor * (strength + glow);
    
    // Animated brightness
    float brightness = 1.0 + 0.2 * sin(uTime * 3.0);
    finalColor *= brightness;
    
    // Output with opacity
    gl_FragColor = vec4(finalColor, strength * vOpacity * textureColor.a);
}