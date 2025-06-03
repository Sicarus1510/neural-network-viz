attribute vec3 velocity;
attribute float size;
attribute float lifetime;
attribute float phase;

uniform float uTime;
uniform float uParticleSize;
uniform vec3 uCameraPosition;

varying vec3 vColor;
varying float vOpacity;

void main() {
    vColor = color;
    
    // Calculate opacity based on lifetime
    vOpacity = smoothstep(0.0, 1.0, lifetime / 10.0);
    
    // Animated position
    vec3 animatedPosition = position;
    animatedPosition += sin(uTime * 0.5 + phase) * velocity * 0.5;
    
    // Transform position
    vec4 mvPosition = modelViewMatrix * vec4(animatedPosition, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    
    // Calculate point size with distance attenuation
    float distanceToCamera = length(uCameraPosition - animatedPosition);
    gl_PointSize = size * uParticleSize * (100.0 / distanceToCamera);
    
    // Add pulsing effect
    gl_PointSize *= (1.0 + 0.3 * sin(uTime * 2.0 + phase));
    
    // Clamp size
    gl_PointSize = clamp(gl_PointSize, 1.0, 20.0);
}