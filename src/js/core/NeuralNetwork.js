// src/js/core/NeuralNetwork.js
import * as THREE from 'three';
import Delaunator from 'delaunator'; // You'll need to install: npm install delaunator

export class NeuralNetwork {
    constructor(scene, params) {
        this.scene = scene;
        this.params = params;
        this.group = new THREE.Group();
        this.group.name = 'NeuralNetworkGroup';
        
        // Enhanced structure
        this.nodes = [];
        this.edges = [];
        this.flowPaths = [];
        this.nodePositions = [];
        this.pulseWaves = [];
        
        // Octagon parameters
        this.octagonRadius = 8;
        this.octagonDepth = 2;
        this.innerRadius = 6;
        
        // Flow field parameters
        this.flowField = null;
        this.flowFieldSize = 128;
        this.flowFieldData = null;
        
        // Animation state
        this.time = 0;
        this.energyFlow = [];
        
        // Performance
        this.maxPulseWaves = 10;
        this.disposed = false;
    }
    
    async init() {
        if (this.disposed) return;
        
        try {
            this.createAdvancedOctagonStructure();
            this.createFlowField();
            this.createInternalNetwork();
            this.createFlowPaths();
            this.initializeEnergyFlow();
            this.scene.add(this.group);
        } catch (error) {
            console.error('Failed to initialize neural network:', error);
            throw error;
        }
    }
    
    createAdvancedOctagonStructure() {
        // Create multi-layered octagon with better visual depth
        const octagonLayers = 3;
        const layerOffset = 0.3;
        
        for (let layer = 0; layer < octagonLayers; layer++) {
            const scale = 1 - (layer * 0.1);
            const opacity = 0.8 - (layer * 0.2);
            
            // Create octagon ring
            const geometry = new THREE.BufferGeometry();
            const vertices = [];
            const normals = [];
            const uvs = [];
            const indices = [];
            
            const segments = 8;
            const angleStep = (Math.PI * 2) / segments;
            
            // Create vertices for inner and outer ring
            for (let i = 0; i <= segments; i++) {
                const angle = i * angleStep;
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                
                // Outer vertex
                vertices.push(
                    cos * this.octagonRadius * scale,
                    sin * this.octagonRadius * scale,
                    layer * layerOffset
                );
                normals.push(0, 0, 1);
                uvs.push(i / segments, 1);
                
                // Inner vertex
                vertices.push(
                    cos * this.innerRadius * scale,
                    sin * this.innerRadius * scale,
                    layer * layerOffset
                );
                normals.push(0, 0, 1);
                uvs.push(i / segments, 0);
            }
            
            // Create faces
            for (let i = 0; i < segments; i++) {
                const a = i * 2;
                const b = i * 2 + 1;
                const c = (i + 1) * 2 + 1;
                const d = (i + 1) * 2;
                
                indices.push(a, b, c);
                indices.push(a, c, d);
            }
            
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
            geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
            geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            geometry.setIndex(indices);
            
            // Create advanced material with custom shader
            const material = new THREE.ShaderMaterial({
                uniforms: {
                    uTime: { value: 0 },
                    uLayer: { value: layer },
                    uOpacity: { value: opacity },
                    uGlowColor: { value: new THREE.Color(0x00ffff) },
                    uPulseIntensity: { value: 1.0 }
                },
                vertexShader: this.getOctagonVertexShader(),
                fragmentShader: this.getOctagonFragmentShader(),
                transparent: true,
                side: THREE.DoubleSide,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            });
            
            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = `OctagonLayer_${layer}`;
            this.group.add(mesh);
        }
        
        // Store octagon vertices for connection points
        this.octagonVertices = [];
        for (let i = 0; i < 8; i++) {
            const angle = i * (Math.PI * 2) / 8;
            this.octagonVertices.push(new THREE.Vector3(
                Math.cos(angle) * this.octagonRadius,
                Math.sin(angle) * this.octagonRadius,
                0
            ));
        }
    }
    
    createFlowField() {
        // Create a flow field texture for guiding particle movement
        const size = this.flowFieldSize;
        this.flowFieldData = new Float32Array(size * size * 4);
        
        // Generate flow field based on octagonal structure
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const u = (x / size) * 2 - 1;
                const v = (y / size) * 2 - 1;
                
                // Convert to world coordinates
                const wx = u * this.octagonRadius * 1.5;
                const wy = v * this.octagonRadius * 1.5;
                
                // Calculate flow direction based on octagonal shape
                const angle = Math.atan2(wy, wx);
                const distance = Math.sqrt(wx * wx + wy * wy);
                
                // Create circular flow with octagonal influence
                let flowX = -Math.sin(angle);
                let flowY = Math.cos(angle);
                
                // Add turbulence
                const turbulence = this.noise2D(wx * 0.1, wy * 0.1) * 0.5;
                flowX += Math.cos(turbulence * Math.PI * 2) * 0.3;
                flowY += Math.sin(turbulence * Math.PI * 2) * 0.3;
                
                // Normalize and apply strength based on distance
                const length = Math.sqrt(flowX * flowX + flowY * flowY);
                if (length > 0) {
                    flowX /= length;
                    flowY /= length;
                }
                
                const strength = Math.min(1, distance / this.octagonRadius);
                
                const idx = (y * size + x) * 4;
                this.flowFieldData[idx] = flowX * strength;
                this.flowFieldData[idx + 1] = flowY * strength;
                this.flowFieldData[idx + 2] = 0;
                this.flowFieldData[idx + 3] = strength;
            }
        }
        
        // Create texture from flow field data
        this.flowField = new THREE.DataTexture(
            this.flowFieldData,
            size,
            size,
            THREE.RGBAFormat,
            THREE.FloatType
        );
        this.flowField.needsUpdate = true;
    }
    
    createInternalNetwork() {
        // Generate sophisticated internal network using Delaunay triangulation
        const points = [];
        const nodeCount = Math.min(Math.floor(this.params.particleCount / 20), 200);
        
        // Generate points using multiple strategies for interesting distribution
        
        // 1. Concentric rings
        const rings = 4;
        for (let ring = 1; ring <= rings; ring++) {
            const radius = (ring / rings) * this.innerRadius;
            const pointsInRing = ring * 8;
            for (let i = 0; i < pointsInRing; i++) {
                const angle = (i / pointsInRing) * Math.PI * 2;
                const jitter = (Math.random() - 0.5) * 0.5;
                points.push([
                    Math.cos(angle + jitter) * radius,
                    Math.sin(angle + jitter) * radius
                ]);
            }
        }
        
        // 2. Strategic points at octagon vertices projections
        this.octagonVertices.forEach(vertex => {
            points.push([vertex.x * 0.7, vertex.y * 0.7]);
            points.push([vertex.x * 0.4, vertex.y * 0.4]);
        });
        
        // 3. Random points within octagon bounds
        for (let i = 0; i < nodeCount / 2; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * this.innerRadius * 0.8;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            
            if (this.isInsideOctagon(new THREE.Vector3(x, y, 0))) {
                points.push([x, y]);
            }
        }
        
        // Perform Delaunay triangulation
        const delaunay = new Delaunator(points.flat());
        const triangles = delaunay.triangles;
        
        // Create nodes at unique positions
        const uniquePositions = new Map();
        points.forEach((point, index) => {
            const key = `${point[0].toFixed(3)},${point[1].toFixed(3)}`;
            if (!uniquePositions.has(key)) {
                uniquePositions.set(key, {
                    position: new THREE.Vector3(point[0], point[1], (Math.random() - 0.5) * 0.5),
                    index: index
                });
            }
        });
        
        // Create sophisticated nodes
        uniquePositions.forEach((data, key) => {
            this.createAdvancedNode(data.position, data.index);
            this.nodePositions.push(data.position);
        });
        
        // Create edges from Delaunay triangulation
        const edgeSet = new Set();
        for (let i = 0; i < triangles.length; i += 3) {
            for (let j = 0; j < 3; j++) {
                const a = triangles[i + j];
                const b = triangles[i + ((j + 1) % 3)];
                const edge = [Math.min(a, b), Math.max(a, b)].join('-');
                edgeSet.add(edge);
            }
        }
        
        // Create edge geometries with flow information
        edgeSet.forEach(edge => {
            const [a, b] = edge.split('-').map(Number);
            if (points[a] && points[b]) {
                const start = new THREE.Vector3(points[a][0], points[a][1], 0);
                const end = new THREE.Vector3(points[b][0], points[b][1], 0);
                this.createFlowEdge(start, end);
            }
        });
    }
    
    createAdvancedNode(position, index) {
        // Create node with multiple visual layers
        const nodeGroup = new THREE.Group();
        
        // Core sphere
        const coreGeometry = new THREE.SphereGeometry(0.15, 32, 32);
        const coreMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uPulsePhase: { value: Math.random() * Math.PI * 2 },
                uCoreColor: { value: new THREE.Color(0xffffff) },
                uGlowColor: { value: new THREE.Color(0x00ffff) },
                uIntensity: { value: 1.0 }
            },
            vertexShader: this.getNodeVertexShader(),
            fragmentShader: this.getNodeFragmentShader(),
            transparent: true,
            depthWrite: false
        });
        
        const core = new THREE.Mesh(coreGeometry, coreMaterial);
        nodeGroup.add(core);
        
        // Outer glow sphere
        const glowGeometry = new THREE.SphereGeometry(0.3, 16, 16);
        const glowMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uIntensity: { value: 0.5 },
                uColor: { value: new THREE.Color(0x00ffff) }
            },
            vertexShader: this.getGlowVertexShader(),
            fragmentShader: this.getGlowFragmentShader(),
            transparent: true,
            depthWrite: false,
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending
        });
        
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        nodeGroup.add(glow);
        
        nodeGroup.position.copy(position);
        nodeGroup.userData = {
            nodeId: `node_${index}`,
            baseIntensity: 0.5 + Math.random() * 0.5,
            pulsePhase: Math.random() * Math.PI * 2,
            connections: [],
            flowStrength: 0,
            core: core,
            glow: glow
        };
        
        this.nodes.push(nodeGroup);
        this.group.add(nodeGroup);
    }
    
    createFlowEdge(start, end) {
        // Create sophisticated edge with flow visualization
        const direction = new THREE.Vector3().subVectors(end, start);
        const length = direction.length();
        direction.normalize();
        
        // Create tube geometry for better visuals
        const curve = new THREE.CatmullRomCurve3([
            start,
            new THREE.Vector3().lerpVectors(start, end, 0.5).add(
                new THREE.Vector3(
                    (Math.random() - 0.5) * 0.3,
                    (Math.random() - 0.5) * 0.3,
                    (Math.random() - 0.5) * 0.1
                )
            ),
            end
        ]);
        
        const tubeGeometry = new THREE.TubeGeometry(curve, 16, 0.02, 8, false);
        const tubeMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uFlowSpeed: { value: 1.0 + Math.random() },
                uFlowDirection: { value: direction },
                uLength: { value: length },
                uOpacity: { value: 0.6 },
                uColor: { value: new THREE.Color(0x00ccff) }
            },
            vertexShader: this.getEdgeVertexShader(),
            fragmentShader: this.getEdgeFragmentShader(),
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        
        const edge = new THREE.Mesh(tubeGeometry, tubeMaterial);
        edge.userData = {
            start: start.clone(),
            end: end.clone(),
            curve: curve,
            baseOpacity: 0.3 + Math.random() * 0.3
        };
        
        this.edges.push(edge);
        this.group.add(edge);
        
        // Store flow path for particles
        this.flowPaths.push({
            curve: curve,
            direction: direction,
            length: length
        });
    }
    
    createFlowPaths() {
        // Create main flow paths along octagon edges
        for (let i = 0; i < this.octagonVertices.length; i++) {
            const current = this.octagonVertices[i];
            const next = this.octagonVertices[(i + 1) % this.octagonVertices.length];
            
            const curve = new THREE.CatmullRomCurve3([
                current,
                new THREE.Vector3().lerpVectors(current, next, 0.5).add(
                    new THREE.Vector3(0, 0, Math.sin(i * 0.5) * 0.5)
                ),
                next
            ]);
            
            this.flowPaths.push({
                curve: curve,
                direction: new THREE.Vector3().subVectors(next, current).normalize(),
                length: current.distanceTo(next),
                isMain: true
            });
        }
    }
    
    initializeEnergyFlow() {
        // Initialize energy packets that flow through the network
        const energyCount = 20;
        
        for (let i = 0; i < energyCount; i++) {
            const pathIndex = Math.floor(Math.random() * this.flowPaths.length);
            const path = this.flowPaths[pathIndex];
            
            this.energyFlow.push({
                path: path,
                progress: Math.random(),
                speed: 0.2 + Math.random() * 0.3,
                intensity: 0.5 + Math.random() * 0.5,
                color: new THREE.Color().setHSL(Math.random() * 0.1 + 0.5, 1.0, 0.5)
            });
        }
    }
    
    // Shader functions
    getOctagonVertexShader() {
        return /* glsl */`
            uniform float uTime;
            uniform float uLayer;
            
            varying vec2 vUv;
            varying vec3 vPosition;
            varying float vDistortion;
            
            void main() {
                vUv = uv;
                vPosition = position;
                
                // Add wave distortion
                float distortion = sin(position.x * 2.0 + uTime) * 0.02;
                distortion += cos(position.y * 2.0 + uTime * 1.3) * 0.02;
                vDistortion = distortion;
                
                vec3 pos = position;
                pos.z += distortion * (1.0 - uLayer * 0.3);
                
                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `;
    }
    
    getOctagonFragmentShader() {
        return /* glsl */`
            uniform float uTime;
            uniform float uOpacity;
            uniform vec3 uGlowColor;
            uniform float uPulseIntensity;
            
            varying vec2 vUv;
            varying vec3 vPosition;
            varying float vDistortion;
            
            void main() {
                // Create gradient from inner to outer edge
                float gradient = smoothstep(0.0, 1.0, vUv.y);
                
                // Add pulsing effect
                float pulse = sin(uTime * 2.0) * 0.5 + 0.5;
                
                // Calculate distance-based glow
                float distanceFromCenter = length(vPosition.xy);
                float glow = 1.0 / (1.0 + distanceFromCenter * 0.1);
                
                // Combine effects
                vec3 color = mix(uGlowColor, vec3(1.0), gradient * 0.5);
                color *= (1.0 + pulse * uPulseIntensity);
                color += uGlowColor * glow * 0.3;
                
                // Apply distortion to alpha
                float alpha = uOpacity * gradient * (1.0 + vDistortion * 5.0);
                alpha *= (0.8 + pulse * 0.2);
                
                gl_FragColor = vec4(color, alpha);
            }
        `;
    }
    
    getNodeVertexShader() {
        return /* glsl */`
            uniform float uTime;
            uniform float uPulsePhase;
            
            varying vec3 vNormal;
            varying vec3 vViewPosition;
            varying float vPulse;
            
            void main() {
                vNormal = normalize(normalMatrix * normal);
                
                // Calculate pulse
                vPulse = sin(uTime * 3.0 + uPulsePhase) * 0.5 + 0.5;
                
                // Animate vertex positions
                vec3 pos = position;
                pos *= 1.0 + vPulse * 0.1;
                
                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                vViewPosition = mvPosition.xyz;
                
                gl_Position = projectionMatrix * mvPosition;
            }
        `;
    }
    
    getNodeFragmentShader() {
        return /* glsl */`
            uniform float uTime;
            uniform vec3 uCoreColor;
            uniform vec3 uGlowColor;
            uniform float uIntensity;
            
            varying vec3 vNormal;
            varying vec3 vViewPosition;
            varying float vPulse;
            
            void main() {
                // Fresnel effect
                vec3 viewDir = normalize(-vViewPosition);
                float fresnel = 1.0 - max(dot(viewDir, vNormal), 0.0);
                fresnel = pow(fresnel, 2.0);
                
                // Core color with glow
                vec3 color = mix(uCoreColor, uGlowColor, fresnel);
                color *= uIntensity * (1.0 + vPulse);
                
                // Add bright center
                float centerGlow = 1.0 - length(gl_PointCoord - vec2(0.5)) * 2.0;
                centerGlow = max(0.0, centerGlow);
                color += uCoreColor * centerGlow * 2.0;
                
                float alpha = (fresnel * 0.5 + 0.5) * uIntensity;
                
                gl_FragColor = vec4(color, alpha);
            }
        `;
    }
    
    getGlowVertexShader() {
        return /* glsl */`
            varying vec3 vNormal;
            varying vec3 vPosition;
            
            void main() {
                vNormal = normalize(normalMatrix * normal);
                vPosition = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;
    }
    
    getGlowFragmentShader() {
        return /* glsl */`
            uniform float uTime;
            uniform float uIntensity;
            uniform vec3 uColor;
            
            varying vec3 vNormal;
            varying vec3 vPosition;
            
            void main() {
                float alpha = 1.0 - length(vPosition) / 0.3;
                alpha = pow(alpha, 3.0) * uIntensity;
                
                vec3 color = uColor * (1.0 + sin(uTime * 2.0) * 0.2);
                
                gl_FragColor = vec4(color, alpha);
            }
        `;
    }
    
    getEdgeVertexShader() {
        return /* glsl */`
            uniform float uTime;
            uniform float uFlowSpeed;
            uniform float uLength;
            
            attribute float vertexDistance;
            
            varying float vProgress;
            varying vec3 vPosition;
            
            void main() {
                vPosition = position;
                vProgress = position.x / uLength;
                
                // Add flow animation
                vec3 pos = position;
                float wave = sin(vProgress * 10.0 - uTime * uFlowSpeed) * 0.02;
                pos.y += wave;
                pos.z += wave * 0.5;
                
                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `;
    }
    
    getEdgeFragmentShader() {
        return /* glsl */`
            uniform float uTime;
            uniform float uOpacity;
            uniform vec3 uColor;
            uniform float uFlowSpeed;
            
            varying float vProgress;
            varying vec3 vPosition;
            
            void main() {
                // Create flowing effect
                float flow = fract(vProgress * 5.0 - uTime * uFlowSpeed);
                flow = smoothstep(0.0, 0.1, flow) * smoothstep(1.0, 0.9, flow);
                
                // Add glow
                float glow = sin(vProgress * 20.0 - uTime * uFlowSpeed * 4.0) * 0.5 + 0.5;
                
                vec3 color = uColor * (1.0 + glow * 0.5);
                float alpha = uOpacity * (0.5 + flow * 0.5);
                
                gl_FragColor = vec4(color, alpha);
            }
        `;
    }
    
    // Utility functions
    noise2D(x, y) {
        // Simple 2D noise function for flow field generation
        return Math.sin(x * 12.9898 + y * 78.233) * 43758.5453 % 1;
    }
    
    isInsideOctagon(position) {
        // Check if position is inside octagon boundary
        const angle = Math.atan2(position.y, position.x);
        const segmentAngle = Math.PI / 4;
        const segment = Math.floor((angle + Math.PI) / segmentAngle);
        const localAngle = (angle + Math.PI) % segmentAngle - segmentAngle / 2;
        
        const maxRadius = this.octagonRadius / Math.cos(localAngle);
        const distance = Math.sqrt(position.x * position.x + position.y * position.y);
        
        return distance <= maxRadius * 0.95;
    }
    
    update(elapsedTime, deltaTime) {
        if (this.disposed) return;
        
        this.time = elapsedTime;
        
        // Update all shader uniforms
        this.group.traverse((child) => {
            if (child.material && child.material.uniforms) {
                if (child.material.uniforms.uTime) {
                    child.material.uniforms.uTime.value = elapsedTime;
                }
            }
        });
        
        // Update nodes with more sophisticated animation
        this.nodes.forEach((nodeGroup, index) => {
            const userData = nodeGroup.userData;
            
            // Calculate node activity based on connections
            let activity = userData.baseIntensity;
            
            // Check for nearby pulse waves
            this.pulseWaves.forEach(wave => {
                const distance = nodeGroup.position.distanceTo(wave.origin);
                if (distance < wave.radius && distance > wave.radius - 2) {
                    activity += wave.intensity * (1 - (distance - wave.radius + 2) / 2);
                }
            });
            
            // Update node materials
            if (userData.core && userData.core.material.uniforms.uIntensity) {
                userData.core.material.uniforms.uIntensity.value = 
                    Math.min(2, activity * this.params.glowIntensity);
            }
            
            if (userData.glow && userData.glow.material.uniforms.uIntensity) {
                userData.glow.material.uniforms.uIntensity.value = 
                    Math.min(1, activity * this.params.glowIntensity * 0.5);
            }
            
            // Subtle floating animation
            const floatY = Math.sin(elapsedTime * 0.5 + userData.pulsePhase) * 0.05;
            const floatX = Math.cos(elapsedTime * 0.3 + userData.pulsePhase) * 0.03;
            nodeGroup.position.y = nodeGroup.userData.originalPosition?.y || 0 + floatY;
            nodeGroup.position.x = (nodeGroup.userData.originalPosition?.x || 0) + floatX;
        });
        
        // Update energy flow
        this.energyFlow.forEach(energy => {
            energy.progress += energy.speed * deltaTime;
            if (energy.progress > 1) {
                energy.progress = 0;
                // Switch to a different path occasionally
                if (Math.random() < 0.3) {
                    energy.path = this.flowPaths[
                        Math.floor(Math.random() * this.flowPaths.length)
                    ];
                }
            }
        });
        
        // Update pulse waves
        this.pulseWaves = this.pulseWaves.filter(wave => {
            wave.radius += wave.speed * deltaTime;
            wave.life -= deltaTime;
            wave.intensity = Math.max(0, wave.life / 3);
            return wave.life > 0;
        });
        
        // Overall structure animation
        this.group.rotation.z += deltaTime * this.params.rotationSpeed * 0.1;
        
        // Breathing effect
        const breathe = Math.sin(elapsedTime * 0.3) * 0.02 + 1;
        this.group.scale.setScalar(this.params.networkScale * breathe);
    }
    
    triggerPulse(origin) {
        if (this.pulseWaves.length >= this.maxPulseWaves) {
            this.pulseWaves.shift();
        }
        
        this.pulseWaves.push({
            origin: origin.clone(),
            radius: 0,
            speed: 8,
            intensity: 1.5,
            life: 4
        });
    }
    
    getNodePositions() {
        return this.nodePositions;
    }
    
    getFlowPaths() {
        return this.flowPaths;
    }
    
    getFlowField() {
        return this.flowField;
    }
    
    getInteractiveObjects() {
        return this.nodes.map(n => n.userData.core).filter(Boolean);
    }
    
    updateParams(params) {
        this.params = params;
    }
    
    dispose() {
        this.disposed = true;
        
        // Dispose all geometries and materials
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
        
        if (this.flowField) this.flowField.dispose();
        
        this.scene.remove(this.group);
        
        // Clear arrays
        this.nodes.length = 0;
        this.edges.length = 0;
        this.nodePositions.length = 0;
        this.flowPaths.length = 0;
        this.pulseWaves.length = 0;
        this.energyFlow.length = 0;
    }
}