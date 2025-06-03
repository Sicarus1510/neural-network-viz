import * as THREE from 'three';

export class ParticleFlow {
    constructor(scene, neuralNetwork, params) {
        this.scene = scene;
        this.neuralNetwork = neuralNetwork;
        this.params = params;
        this.particleSystem = null;
        this.time = 0;
        
        this.init();
    }
    
    init() {
        this.createParticleTexture();
        this.createParticleSystem();
    }
    
    createParticleTexture() {
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        // Create glowing particle
        const gradient = ctx.createRadialGradient(
            size / 2, size / 2, 0,
            size / 2, size / 2, size / 2
        );
        
        gradient.addColorStop(0, 'rgba(255, 200, 100, 1)');
        gradient.addColorStop(0.2, 'rgba(255, 170, 68, 0.8)');
        gradient.addColorStop(0.4, 'rgba(255, 136, 0, 0.6)');
        gradient.addColorStop(0.7, 'rgba(255, 100, 0, 0.3)');
        gradient.addColorStop(1, 'rgba(255, 68, 0, 0)');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
        
        this.particleTexture = new THREE.CanvasTexture(canvas);
        this.particleTexture.needsUpdate = true;
    }
    
    createParticleSystem() {
        const geometry = new THREE.BufferGeometry();
        const count = this.params.particleCount;
        
        // Attributes
        const positions = new Float32Array(count * 3);
        const velocities = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const sizes = new Float32Array(count);
        const lifetimes = new Float32Array(count);
        const ages = new Float32Array(count);
        
        // Get edge data from neural network
        const edges = this.neuralNetwork.getEdgeData();
        
        // Initialize particles along edges
        for (let i = 0; i < count; i++) {
            // Select random edge
            const edge = edges[Math.floor(Math.random() * edges.length)];
            const t = Math.random();
            
            // Position along edge
            positions[i * 3] = edge.start.x + (edge.end.x - edge.start.x) * t;
            positions[i * 3 + 1] = edge.start.y + (edge.end.y - edge.start.y) * t;
            positions[i * 3 + 2] = edge.start.z + (edge.end.z - edge.start.z) * t;
            
            // Velocity direction along edge
            const direction = new THREE.Vector3()
                .subVectors(edge.end, edge.start)
                .normalize();
            
            velocities[i * 3] = direction.x * this.params.particleSpeed;
            velocities[i * 3 + 1] = direction.y * this.params.particleSpeed;
            velocities[i * 3 + 2] = direction.z * this.params.particleSpeed;
            
            // Golden/amber color with variation
            const hue = 0.08 + Math.random() * 0.05; // Orange to yellow
            const saturation = 0.8 + Math.random() * 0.2;
            const lightness = 0.5 + Math.random() * 0.2;
            const color = new THREE.Color().setHSL(hue, saturation, lightness);
            
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
            
            sizes[i] = 20 + Math.random() * 40;
            lifetimes[i] = 2 + Math.random() * 3;
            ages[i] = Math.random() * lifetimes[i];
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        geometry.setAttribute('lifetime', new THREE.BufferAttribute(lifetimes, 1));
        geometry.setAttribute('age', new THREE.BufferAttribute(ages, 1));
        
        // Shader material
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uTexture: { value: this.particleTexture },
                uPixelRatio: { value: this.scene.renderer?.getPixelRatio() || 1 }
            },
            vertexShader: `
                attribute vec3 velocity;
                attribute float size;
                attribute float lifetime;
                attribute float age;
                
                varying vec3 vColor;
                varying float vOpacity;
                
                uniform float uTime;
                uniform float uPixelRatio;
                
                void main() {
                    vColor = color;
                    
                    // Calculate opacity based on age
                    float normalizedAge = age / lifetime;
                    vOpacity = smoothstep(0.0, 0.1, normalizedAge) * 
                              smoothstep(1.0, 0.7, normalizedAge);
                    
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_Position = projectionMatrix * mvPosition;
                    
                    // Size attenuation
                    gl_PointSize = size * uPixelRatio * (300.0 / -mvPosition.z);
                    gl_PointSize = clamp(gl_PointSize, 2.0, 100.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D uTexture;
                
                varying vec3 vColor;
                varying float vOpacity;
                
                void main() {
                    vec4 texColor = texture2D(uTexture, gl_PointCoord);
                    
                    // Apply color and opacity
                    vec3 finalColor = vColor * texColor.rgb * 2.0; // Brighten
                    float finalOpacity = texColor.a * vOpacity;
                    
                    gl_FragColor = vec4(finalColor, finalOpacity);
                }
            `,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true,
            vertexColors: true
        });
        
        this.particleSystem = new THREE.Points(geometry, material);
        this.scene.add(this.particleSystem);
        
        // Store references
        this.particleData = {
            edges,
            edgeIndices: new Uint16Array(count)
        };
        
        // Assign edge indices to particles
        for (let i = 0; i < count; i++) {
            this.particleData.edgeIndices[i] = Math.floor(Math.random() * edges.length);
        }
    }
    
    updateMousePosition(mouse) {
        // Could implement mouse interaction here
        this.mousePosition = mouse;
    }
    
    triggerBurst(position) {
        // Create burst of particles at position
        const positions = this.particleSystem.geometry.attributes.position;
        const velocities = this.particleSystem.geometry.attributes.velocity;
        const ages = this.particleSystem.geometry.attributes.age;
        const lifetimes = this.particleSystem.geometry.attributes.lifetime;
        
        // Find 50 random particles to reset
        const burstCount = 50;
        const indices = [];
        
        for (let i = 0; i < burstCount; i++) {
            indices.push(Math.floor(Math.random() * this.params.particleCount));
        }
        
        indices.forEach(i => {
            // Reset position to burst point
            positions.array[i * 3] = position.x;
            positions.array[i * 3 + 1] = position.y;
            positions.array[i * 3 + 2] = position.z;
            
            // Random burst velocity
            const angle = Math.random() * Math.PI * 2;
            const speed = 0.5 + Math.random() * 1;
            
            velocities.array[i * 3] = Math.cos(angle) * speed;
            velocities.array[i * 3 + 1] = Math.random() * speed;
            velocities.array[i * 3 + 2] = Math.sin(angle) * speed;
            
            // Reset age
            ages.array[i] = 0;
            lifetimes.array[i] = 1 + Math.random() * 2;
        });
        
        positions.needsUpdate = true;
        velocities.needsUpdate = true;
        ages.needsUpdate = true;
        lifetimes.needsUpdate = true;
    }
    
    update(elapsedTime, deltaTime) {
        if (!this.particleSystem) return;
        
        this.time = elapsedTime;
        
        // Update uniforms
        this.particleSystem.material.uniforms.uTime.value = elapsedTime;
        
        // Update particles
        const positions = this.particleSystem.geometry.attributes.position;
        const velocities = this.particleSystem.geometry.attributes.velocity;
        const ages = this.particleSystem.geometry.attributes.age;
        const lifetimes = this.particleSystem.geometry.attributes.lifetime;
        
        const edges = this.particleData.edges;
        const edgeIndices = this.particleData.edgeIndices;
        
        for (let i = 0; i < this.params.particleCount; i++) {
            // Update age
            ages.array[i] += deltaTime;
            
            // Check if particle should respawn
            if (ages.array[i] > lifetimes.array[i]) {
                // Reset particle
                ages.array[i] = 0;
                
                // Pick new edge
                const edgeIndex = Math.floor(Math.random() * edges.length);
                edgeIndices[i] = edgeIndex;
                const edge = edges[edgeIndex];
                
                // Reset position to start of edge
                positions.array[i * 3] = edge.start.x;
                positions.array[i * 3 + 1] = edge.start.y;
                positions.array[i * 3 + 2] = edge.start.z;
                
                // Reset velocity along edge
                const direction = new THREE.Vector3()
                    .subVectors(edge.end, edge.start)
                    .normalize();
                
                velocities.array[i * 3] = direction.x * this.params.particleSpeed;
                velocities.array[i * 3 + 1] = direction.y * this.params.particleSpeed;
                velocities.array[i * 3 + 2] = direction.z * this.params.particleSpeed;
            } else {
                // Update position
                positions.array[i * 3] += velocities.array[i * 3] * deltaTime;
                positions.array[i * 3 + 1] += velocities.array[i * 3 + 1] * deltaTime;
                positions.array[i * 3 + 2] += velocities.array[i * 3 + 2] * deltaTime;
                
                // Add slight turbulence
                const turbulence = 0.1;
                positions.array[i * 3] += (Math.random() - 0.5) * turbulence * deltaTime;
                positions.array[i * 3 + 1] += (Math.random() - 0.5) * turbulence * deltaTime;
                positions.array[i * 3 + 2] += (Math.random() - 0.5) * turbulence * deltaTime;
            }
        }
        
        positions.needsUpdate = true;
        ages.needsUpdate = true;
    }
    
    dispose() {
        if (this.particleSystem) {
            this.particleSystem.geometry.dispose();
            this.particleSystem.material.dispose();
            this.particleTexture.dispose();
            this.scene.remove(this.particleSystem);
        }
    }
}