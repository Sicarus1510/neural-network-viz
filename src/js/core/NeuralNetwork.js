// src/js/core/NeuralNetwork.js
import * as THREE from 'three';

export class NeuralNetwork {
    constructor(scene, params) {
        this.scene = scene;
        this.params = params;
        this.group = new THREE.Group();
        
        // Core structure components
        this.octagonFrame = null;
        this.innerCore = null;
        this.energyChannels = [];
        this.connectionNodes = [];
        this.glowPlanes = [];
        
        // Energy flow system
        this.energyPulses = [];
        this.flowTexture = null;
        this.flowRenderTarget = null;
        
        // Animation state
        this.time = 0;
        this.clock = new THREE.Clock();
        
        this.init();
    }
    
    init() {
        this.createFlowRenderTarget();
        this.createCrystallineOctagon();
        this.createInnerCore();
        this.createEnergyChannels();
        this.createConnectionNodes();
        this.initializeEnergyFlow();
        this.scene.add(this.group);
    }
    
    createFlowRenderTarget() {
        // Create render target for flow visualization
        this.flowRenderTarget = new THREE.WebGLRenderTarget(1024, 1024, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType
        });
    }
    
    createCrystallineOctagon() {
        // Create the main octagonal crystalline structure
        const octagonGeometry = new THREE.CylinderGeometry(8, 8, 0.5, 8, 1, false);
        
        // Custom shader for glass-like crystalline effect
        const crystalMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uRefractPower: { value: 0.3 },
                uChromaticAberration: { value: 0.2 },
                uSaturation: { value: 1.2 },
                uShininess: { value: 40.0 },
                uDiffuseness: { value: 0.2 },
                uFresnelPower: { value: 8.0 },
                uEnvMap: { value: null },
                uFlowTexture: { value: null },
                uCameraPosition: { value: new THREE.Vector3() }
            },
            vertexShader: `
                varying vec3 vNormal;
                varying vec3 vPosition;
                varying vec3 vWorldPosition;
                varying vec2 vUv;
                varying vec3 vReflect;
                varying vec3 vRefract[3];
                varying float vReflectionFactor;
                
                uniform float uRefractPower;
                uniform float uFresnelPower;
                uniform float uChromaticAberration;
                
                void main() {
                    vUv = uv;
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    vPosition = position;
                    
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    vec3 worldNormal = normalize(mat3(modelMatrix) * normal);
                    vNormal = worldNormal;
                    
                    // Calculate reflection and refraction vectors
                    vec3 cameraToVertex = normalize(worldPosition.xyz - cameraPosition);
                    vReflect = reflect(cameraToVertex, worldNormal);
                    
                    // Chromatic aberration for refraction
                    float ior = 1.0 / 1.31;
                    vRefract[0] = refract(cameraToVertex, worldNormal, ior * (1.0 - uChromaticAberration));
                    vRefract[1] = refract(cameraToVertex, worldNormal, ior);
                    vRefract[2] = refract(cameraToVertex, worldNormal, ior * (1.0 + uChromaticAberration));
                    
                    // Fresnel
                    float fresnelFactor = pow(1.0 - dot(-cameraToVertex, worldNormal), uFresnelPower);
                    vReflectionFactor = clamp(fresnelFactor, 0.0, 1.0);
                    
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform float uTime;
                uniform float uSaturation;
                uniform float uShininess;
                uniform float uDiffuseness;
                uniform samplerCube uEnvMap;
                uniform sampler2D uFlowTexture;
                uniform vec3 uCameraPosition;
                
                varying vec3 vNormal;
                varying vec3 vPosition;
                varying vec3 vWorldPosition;
                varying vec2 vUv;
                varying vec3 vReflect;
                varying vec3 vRefract[3];
                varying float vReflectionFactor;
                
                vec3 czm_saturation(vec3 rgb, float adjustment) {
                    const vec3 W = vec3(0.2125, 0.7154, 0.0721);
                    vec3 intensity = vec3(dot(rgb, W));
                    return mix(intensity, rgb, adjustment);
                }
                
                void main() {
                    // Sample environment for reflections
                    vec3 reflection = vec3(0.0);
                    if (uEnvMap != null) {
                        reflection = textureCube(uEnvMap, vReflect).rgb;
                    }
                    
                    // Sample environment for refractions with chromatic aberration
                    vec3 refraction = vec3(0.0);
                    if (uEnvMap != null) {
                        refraction.r = textureCube(uEnvMap, vRefract[0]).r;
                        refraction.g = textureCube(uEnvMap, vRefract[1]).g;
                        refraction.b = textureCube(uEnvMap, vRefract[2]).b;
                    }
                    
                    // Mix reflection and refraction
                    vec3 color = mix(refraction, reflection, vReflectionFactor);
                    
                    // Add internal glow from flow texture
                    vec2 flowUv = vUv;
                    flowUv.x += sin(uTime * 0.5) * 0.01;
                    vec3 flowColor = texture2D(uFlowTexture, flowUv).rgb;
                    color += flowColor * 0.5;
                    
                    // Edge glow
                    float edgeFactor = pow(1.0 - abs(dot(vNormal, normalize(uCameraPosition - vWorldPosition))), 2.0);
                    vec3 edgeGlow = vec3(0.0, 0.8, 1.0) * edgeFactor * 2.0;
                    color += edgeGlow;
                    
                    // Saturation adjustment
                    color = czm_saturation(color, uSaturation);
                    
                    // Inner light
                    float innerLight = smoothstep(0.0, 1.0, 1.0 - length(vPosition.xy) / 8.0);
                    color += vec3(0.0, 0.5, 1.0) * innerLight * 0.3;
                    
                    gl_FragColor = vec4(color, 0.9);
                }
            `,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        
        // Create the octagon frame
        this.octagonFrame = new THREE.Mesh(octagonGeometry, crystalMaterial);
        this.octagonFrame.rotation.y = Math.PI / 8; // Align octagon
        this.group.add(this.octagonFrame);
        
        // Add wireframe overlay for structure
        const wireframeGeometry = new THREE.EdgesGeometry(octagonGeometry);
        const wireframeMaterial = new THREE.LineBasicMaterial({
            color: 0x00ffff,
            linewidth: 2,
            transparent: true,
            opacity: 0.6
        });
        const wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
        wireframe.rotation.y = Math.PI / 8;
        this.group.add(wireframe);
        
        // Add glow planes at each face
        for (let i = 0; i < 8; i++) {
            const angle = (i * Math.PI * 2) / 8;
            const planeGeometry = new THREE.PlaneGeometry(7, 0.5);
            const planeMaterial = new THREE.ShaderMaterial({
                uniforms: {
                    uTime: { value: 0 },
                    uIntensity: { value: 1.0 },
                    uColor: { value: new THREE.Color(0x00ffff) }
                },
                vertexShader: `
                    varying vec2 vUv;
                    void main() {
                        vUv = uv;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform float uTime;
                    uniform float uIntensity;
                    uniform vec3 uColor;
                    varying vec2 vUv;
                    
                    void main() {
                        float glow = smoothstep(0.0, 0.5, vUv.x) * smoothstep(1.0, 0.5, vUv.x);
                        glow *= smoothstep(0.0, 0.2, vUv.y) * smoothstep(1.0, 0.8, vUv.y);
                        
                        float pulse = sin(uTime * 3.0 + vUv.x * 10.0) * 0.5 + 0.5;
                        glow *= (0.5 + pulse * 0.5);
                        
                        vec3 color = uColor * glow * uIntensity;
                        gl_FragColor = vec4(color, glow * 0.5);
                    }
                `,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                side: THREE.DoubleSide
            });
            
            const plane = new THREE.Mesh(planeGeometry, planeMaterial);
            plane.position.set(
                Math.cos(angle) * 8,
                0,
                Math.sin(angle) * 8
            );
            plane.lookAt(new THREE.Vector3(0, 0, 0));
            this.glowPlanes.push(plane);
            this.group.add(plane);
        }
    }
    
    createInnerCore() {
        // Create the bright central core
        const coreGeometry = new THREE.IcosahedronGeometry(1.5, 3);
        const coreMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uIntensity: { value: 2.0 }
            },
            vertexShader: `
                varying vec3 vNormal;
                varying vec3 vPosition;
                
                void main() {
                    vNormal = normalize(normalMatrix * normal);
                    vPosition = position;
                    
                    float breathing = sin(uTime * 2.0) * 0.1 + 1.0;
                    vec3 pos = position * breathing;
                    
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                }
            `,
            fragmentShader: `
                uniform float uTime;
                uniform float uIntensity;
                
                varying vec3 vNormal;
                varying vec3 vPosition;
                
                void main() {
                    float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.0);
                    
                    vec3 coreColor = vec3(1.0, 1.0, 1.0);
                    vec3 glowColor = vec3(0.0, 0.8, 1.0);
                    
                    vec3 color = mix(coreColor, glowColor, fresnel) * uIntensity;
                    
                    float pulse = sin(uTime * 3.0) * 0.3 + 1.0;
                    color *= pulse;
                    
                    gl_FragColor = vec4(color, 1.0);
                }
            `,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        
        this.innerCore = new THREE.Mesh(coreGeometry, coreMaterial);
        this.group.add(this.innerCore);
        
        // Add outer glow sphere
        const glowGeometry = new THREE.SphereGeometry(3, 32, 32);
        const glowMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 }
            },
            vertexShader: `
                varying vec3 vNormal;
                void main() {
                    vNormal = normalize(normalMatrix * normal);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float uTime;
                varying vec3 vNormal;
                
                void main() {
                    float intensity = pow(0.8 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
                    vec3 color = vec3(0.0, 0.6, 1.0) * intensity;
                    
                    float pulse = sin(uTime * 2.0) * 0.2 + 0.8;
                    color *= pulse;
                    
                    gl_FragColor = vec4(color, intensity * 0.5);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.BackSide
        });
        
        const glowSphere = new THREE.Mesh(glowGeometry, glowMaterial);
        this.group.add(glowSphere);
    }
    
    createEnergyChannels() {
        // Create flowing energy channels within the octagon
        const channelCount = 16;
        
        for (let i = 0; i < channelCount; i++) {
            const angle1 = (i / channelCount) * Math.PI * 2;
            const angle2 = ((i + Math.floor(channelCount * 0.3)) % channelCount) / channelCount * Math.PI * 2;
            
            const start = new THREE.Vector3(
                Math.cos(angle1) * 6,
                (Math.random() - 0.5) * 0.3,
                Math.sin(angle1) * 6
            );
            
            const end = new THREE.Vector3(
                Math.cos(angle2) * 6,
                (Math.random() - 0.5) * 0.3,
                Math.sin(angle2) * 6
            );
            
            const middle = new THREE.Vector3()
                .lerpVectors(start, end, 0.5)
                .multiplyScalar(0.7);
            
            const curve = new THREE.QuadraticBezierCurve3(start, middle, end);
            const tubeGeometry = new THREE.TubeGeometry(curve, 32, 0.05, 8, false);
            
            const channelMaterial = new THREE.ShaderMaterial({
                uniforms: {
                    uTime: { value: 0 },
                    uFlowSpeed: { value: 2.0 + Math.random() },
                    uColor: { value: new THREE.Color(0x00ffff) }
                },
                vertexShader: `
                    varying vec2 vUv;
                    void main() {
                        vUv = uv;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform float uTime;
                    uniform float uFlowSpeed;
                    uniform vec3 uColor;
                    varying vec2 vUv;
                    
                    void main() {
                        float flow = fract(vUv.x * 3.0 - uTime * uFlowSpeed);
                        flow = smoothstep(0.0, 0.1, flow) * smoothstep(1.0, 0.6, flow);
                        
                        vec3 color = uColor * flow * 2.0;
                        float alpha = flow * 0.8;
                        
                        gl_FragColor = vec4(color, alpha);
                    }
                `,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            
            const channel = new THREE.Mesh(tubeGeometry, channelMaterial);
            this.energyChannels.push({
                mesh: channel,
                curve: curve,
                material: channelMaterial
            });
            this.group.add(channel);
        }
    }
    
    createConnectionNodes() {
        // Create glowing connection nodes at key points
        const nodePositions = [];
        
        // Nodes at octagon vertices
        for (let i = 0; i < 8; i++) {
            const angle = (i * Math.PI * 2) / 8;
            nodePositions.push(new THREE.Vector3(
                Math.cos(angle) * 8,
                0,
                Math.sin(angle) * 8
            ));
        }
        
        // Inner ring nodes
        for (let i = 0; i < 8; i++) {
            const angle = (i * Math.PI * 2) / 8 + Math.PI / 8;
            nodePositions.push(new THREE.Vector3(
                Math.cos(angle) * 4,
                0,
                Math.sin(angle) * 4
            ));
        }
        
        nodePositions.forEach(pos => {
            const nodeGeometry = new THREE.SphereGeometry(0.2, 16, 16);
            const nodeMaterial = new THREE.ShaderMaterial({
                uniforms: {
                    uTime: { value: 0 },
                    uIntensity: { value: 1.0 + Math.random() }
                },
                vertexShader: `
                    varying vec3 vNormal;
                    void main() {
                        vNormal = normal;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform float uTime;
                    uniform float uIntensity;
                    varying vec3 vNormal;
                    
                    void main() {
                        float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 1.5);
                        vec3 color = vec3(0.0, 0.8, 1.0) * fresnel * uIntensity;
                        
                        float pulse = sin(uTime * 4.0 + gl_FragCoord.x * 0.01) * 0.5 + 1.0;
                        color *= pulse;
                        
                        gl_FragColor = vec4(color, 1.0);
                    }
                `,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            
            const node = new THREE.Mesh(nodeGeometry, nodeMaterial);
            node.position.copy(pos);
            
            this.connectionNodes.push({
                mesh: node,
                position: pos,
                material: nodeMaterial
            });
            this.group.add(node);
        });
    }
    
    initializeEnergyFlow() {
        // Initialize energy pulses that flow through channels
        this.energyChannels.forEach(channel => {
            for (let i = 0; i < 3; i++) {
                this.energyPulses.push({
                    channel: channel,
                    progress: Math.random(),
                    speed: 0.3 + Math.random() * 0.2,
                    intensity: 0.5 + Math.random() * 0.5
                });
            }
        });
    }
    
    update(elapsedTime, deltaTime) {
        this.time = elapsedTime;
        
        // Update all materials
        if (this.octagonFrame && this.octagonFrame.material.uniforms) {
            this.octagonFrame.material.uniforms.uTime.value = elapsedTime;
            
            const camera = this.scene.getObjectByProperty('type', 'PerspectiveCamera');
            if (camera) {
                this.octagonFrame.material.uniforms.uCameraPosition.value.copy(camera.position);
            }
        }
        
        // Update inner core
        if (this.innerCore && this.innerCore.material.uniforms) {
            this.innerCore.material.uniforms.uTime.value = elapsedTime;
        }
        
        // Update glow planes
        this.glowPlanes.forEach(plane => {
            if (plane.material.uniforms) {
                plane.material.uniforms.uTime.value = elapsedTime;
            }
        });
        
        // Update energy channels
        this.energyChannels.forEach(channel => {
            if (channel.material.uniforms) {
                channel.material.uniforms.uTime.value = elapsedTime;
            }
        });
        
        // Update connection nodes
        this.connectionNodes.forEach(node => {
            if (node.material.uniforms) {
                node.material.uniforms.uTime.value = elapsedTime;
            }
            
            // Gentle floating animation
            node.mesh.position.y = node.position.y + Math.sin(elapsedTime * 2 + node.position.x) * 0.05;
        });
        
        // Update energy pulses
        this.energyPulses.forEach(pulse => {
            pulse.progress += pulse.speed * deltaTime;
            if (pulse.progress > 1) {
                pulse.progress = 0;
                pulse.intensity = 0.5 + Math.random() * 0.5;
            }
        });
        
        // Rotate the entire structure
        this.group.rotation.y += deltaTime * this.params.rotationSpeed * 0.1;
        
        // Subtle breathing animation
        const breathing = Math.sin(elapsedTime * 0.5) * 0.02 + 1.0;
        this.group.scale.setScalar(this.params.networkScale * breathing);
    }
    
    getNodePositions() {
        return this.connectionNodes.map(node => node.position);
    }
    
    getEnergyChannels() {
        return this.energyChannels;
    }
    
    triggerPulse(origin) {
        // Trigger an energy pulse from interaction point
        const nearestChannel = this.findNearestChannel(origin);
        if (nearestChannel) {
            this.energyPulses.push({
                channel: nearestChannel,
                progress: 0,
                speed: 0.8,
                intensity: 2.0
            });
        }
    }
    
    findNearestChannel(point) {
        let nearest = null;
        let minDistance = Infinity;
        
        this.energyChannels.forEach(channel => {
            const testPoint = channel.curve.getPoint(0.5);
            const distance = point.distanceTo(testPoint);
            if (distance < minDistance) {
                minDistance = distance;
                nearest = channel;
            }
        });
        
        return nearest;
    }
    
    updateParams(params) {
        this.params = params;
    }
    
    getInteractiveObjects() {
        return [this.octagonFrame, ...this.connectionNodes.map(n => n.mesh)];
    }
    
    dispose() {
        // Cleanup
        this.group.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
        
        if (this.flowRenderTarget) this.flowRenderTarget.dispose();
        
        this.scene.remove(this.group);
    }
}