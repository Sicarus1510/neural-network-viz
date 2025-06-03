import * as THREE from 'three';

export class NeuralNetwork {
    constructor(scene, params) {
        this.scene = scene;
        this.params = params;
        this.group = new THREE.Group();
        this.group.name = 'NeuralNetworkGroup';
        this.nodes = [];
        this.edges = [];
        this.nodePositions = [];
        this.pulseWaves = [];
        
        this.octagonRadius = 8;
        this.meshDensity = 32;
        this.innerStructureComplexity = 3;
        
        // Performance optimization
        this.maxPulseWaves = 5;
        this.disposed = false;
    }
    
    async init() {
        if (this.disposed) return;
        
        try {
            this.createOctagonStructure();
            this.createInternalMesh();
            this.createEdges();
            this.scene.add(this.group);
        } catch (error) {
            console.error('Failed to initialize neural network:', error);
            throw error;
        }
    }
    
    createOctagonStructure() {
        // Create octagon vertices
        const vertices = [];
        const angleStep = (Math.PI * 2) / 8;
        
        for (let i = 0; i < 8; i++) {
            const angle = i * angleStep;
            const x = Math.cos(angle) * this.octagonRadius;
            const y = Math.sin(angle) * this.octagonRadius;
            vertices.push(new THREE.Vector3(x, y, 0));
        }
        
        // Create main octagon shape
        const shape = new THREE.Shape();
        vertices.forEach((v, i) => {
            if (i === 0) shape.moveTo(v.x, v.y);
            else shape.lineTo(v.x, v.y);
        });
        shape.closePath();
        
        // Extrude to create 3D octagon
        const extrudeSettings = {
            depth: 0.5,
            bevelEnabled: true,
            bevelSegments: 2,
            steps: 1,
            bevelSize: 0.1,
            bevelThickness: 0.1
        };
        
        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geometry.computeBoundingBox();
        geometry.center();
        
        const material = new THREE.MeshPhongMaterial({
            color: 0x1a1a1a,
            emissive: 0x0a0a0a,
            specular: 0x505050,
            shininess: 100,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.8
        });
        
        this.octagonMesh = new THREE.Mesh(geometry, material);
        this.octagonMesh.name = 'OctagonMesh';
        this.group.add(this.octagonMesh);
        
        // Store octagon vertices for edge creation
        this.octagonVertices = vertices;
    }
    
    createInternalMesh() {
        // Generate internal node positions using Fibonacci sphere distribution
        const nodeCount = Math.min(Math.floor(this.params.particleCount / 10), 500); // Cap at 500 nodes
        const phi = Math.PI * (3 - Math.sqrt(5)); // Golden angle
        
        for (let i = 0; i < nodeCount; i++) {
            const y = 1 - (i / (nodeCount - 1)) * 2;
            const radius = Math.sqrt(1 - y * y) * this.octagonRadius * 0.8;
            const theta = phi * i;
            
            const x = Math.cos(theta) * radius;
            const z = Math.sin(theta) * radius * 0.3; // Flatten in Z
            const position = new THREE.Vector3(x, y * this.octagonRadius * 0.8, z);
            
            // Only keep nodes inside octagon bounds
            if (this.isInsideOctagon(position)) {
                this.createNode(position);
                this.nodePositions.push(position);
            }
        }
        
        // Create Delaunay triangulation for internal mesh
        this.createDelaunayMesh();
    }
    
    isInsideOctagon(position) {
        // Simple point-in-polygon test for octagon
        const x = position.x;
        const y = position.y;
        const r = this.octagonRadius;
        
        return Math.abs(x) <= r && 
               Math.abs(y) <= r && 
               Math.abs(x + y) <= r * Math.sqrt(2) && 
               Math.abs(x - y) <= r * Math.sqrt(2);
    }
    
    createNode(position) {
        const geometry = new THREE.SphereGeometry(0.1, 16, 16);
        const material = new THREE.MeshPhongMaterial({
            color: 0xff6b6b,
            emissive: 0xff3333,
            emissiveIntensity: 0.5,
            transparent: true,
            opacity: 0.8
        });
        
        const node = new THREE.Mesh(geometry, material);
        node.position.copy(position);
        node.userData = {
            nodeId: `node_${this.nodes.length}`,
            baseEmissiveIntensity: 0.5,
            pulsePhase: Math.random() * Math.PI * 2,
            originalPosition: position.clone()
        };
        node.name = `Node_${this.nodes.length}`;
        
        this.nodes.push(node);
        this.group.add(node);
    }
    
    createDelaunayMesh() {
        // Simplified Delaunay-like mesh creation
        const positions = this.nodePositions;
        const connections = new Map(); // Use Map to avoid duplicates
        
        // Connect nearby nodes
        for (let i = 0; i < positions.length; i++) {
            const distances = [];
            
            for (let j = 0; j < positions.length; j++) {
                if (i !== j) {
                    distances.push({
                        index: j,
                        distance: positions[i].distanceTo(positions[j])
                    });
                }
            }
            
            // Sort by distance and connect to nearest neighbors
            distances.sort((a, b) => a.distance - b.distance);
            const nearestCount = Math.min(4, distances.length);
            
            for (let k = 0; k < nearestCount; k++) {
                const connection = [i, distances[k].index].sort();
                const key = connection.join('-');
                
                if (!connections.has(key)) {
                    connections.set(key, {
                        indices: connection,
                        distance: distances[k].distance
                    });
                }
            }
        }
        
        // Create edge geometries
        connections.forEach(conn => {
            this.createEdge(
                positions[conn.indices[0]],
                positions[conn.indices[1]],
                conn.distance
            );
        });
    }
    
    createEdge(start, end, distance) {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array([
            start.x, start.y, start.z,
            end.x, end.y, end.z
        ]);
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const material = new THREE.LineBasicMaterial({
            color: 0x4488ff,
            transparent: true,
            opacity: 0.4,
            linewidth: 1 // Note: linewidth > 1 only works with LineBasicMaterial on certain platforms
        });
        
        const line = new THREE.Line(geometry, material);
        line.userData = {
            distance,
            baseOpacity: 0.4,
            startPos: start.clone(),
            endPos: end.clone()
        };
        line.name = `Edge_${this.edges.length}`;
        
        this.edges.push(line);
        this.group.add(line);
    }
    
    createEdges() {
        // Connect octagon vertices
        for (let i = 0; i < this.octagonVertices.length; i++) {
            const next = (i + 1) % this.octagonVertices.length;
            this.createEdge(
                this.octagonVertices[i],
                this.octagonVertices[next],
                this.octagonVertices[i].distanceTo(this.octagonVertices[next])
            );
        }
        
        // Connect some internal nodes to octagon vertices
        const octagonConnections = Math.min(Math.floor(this.nodePositions.length * 0.2), 20);
        for (let i = 0; i < octagonConnections; i++) {
            const nodeIndex = Math.floor(Math.random() * this.nodePositions.length);
            const vertexIndex = Math.floor(Math.random() * this.octagonVertices.length);
            
            this.createEdge(
                this.nodePositions[nodeIndex],
                this.octagonVertices[vertexIndex],
                this.nodePositions[nodeIndex].distanceTo(this.octagonVertices[vertexIndex])
            );
        }
    }
    
    triggerPulse(origin) {
        // Limit number of active pulse waves
        if (this.pulseWaves.length >= this.maxPulseWaves) {
            this.pulseWaves.shift(); // Remove oldest
        }
        
        this.pulseWaves.push({
            origin: origin.clone(),
            radius: 0,
            speed: 10,
            intensity: 1,
            life: 3
        });
    }
    
    update(elapsedTime, deltaTime) {
        if (this.disposed) return;
        
        // Rotate the entire structure
        this.group.rotation.z += deltaTime * this.params.rotationSpeed * 0.1;
        
        // Update node pulsing
        this.nodes.forEach(node => {
            const intensity = 0.5 + 0.5 * Math.sin(
                elapsedTime * this.params.pulseSpeed + node.userData.pulsePhase
            );
            node.material.emissiveIntensity = 
                node.userData.baseEmissiveIntensity * intensity * this.params.glowIntensity;
            
            // Subtle floating animation
            const floatOffset = Math.sin(elapsedTime * 0.5 + node.userData.pulsePhase) * 0.05;
            node.position.y = node.userData.originalPosition.y + floatOffset;
        });
        
        // Update pulse waves
        this.pulseWaves = this.pulseWaves.filter(wave => {
            wave.radius += wave.speed * deltaTime;
            wave.life -= deltaTime;
            wave.intensity = Math.max(0, wave.life / 3);
            
            // Affect nearby nodes and edges
            this.nodes.forEach(node => {
                const distance = node.position.distanceTo(wave.origin);
                if (distance < wave.radius && distance > wave.radius - 2) {
                    const influence = wave.intensity * (1 - (distance - wave.radius + 2) / 2);
                    node.material.emissiveIntensity = Math.min(1, node.material.emissiveIntensity + influence);
                }
            });
            
            this.edges.forEach(edge => {
                const midpoint = new THREE.Vector3()
                    .addVectors(edge.userData.startPos, edge.userData.endPos)
                    .multiplyScalar(0.5);
                
                const distance = midpoint.distanceTo(wave.origin);
                if (distance < wave.radius && distance > wave.radius - 2) {
                    const influence = wave.intensity * (1 - (distance - wave.radius + 2) / 2);
                    edge.material.opacity = Math.min(1, edge.userData.baseOpacity + influence * 0.6);
                }
            });
            
            return wave.life > 0;
        });
        
        // Scale animation
        const scaleWave = 1 + 0.02 * Math.sin(elapsedTime * 0.5);
        this.group.scale.setScalar(this.params.networkScale * scaleWave);
    }
    
    updateParams(params) {
        this.params = params;
    }
    
    getNodePositions() {
        return this.nodePositions;
    }
    
    getInteractiveObjects() {
        return this.nodes;
    }
    
    dispose() {
        this.disposed = true;
        
        // Dispose geometries and materials
        this.nodes.forEach(node => {
            node.geometry.dispose();
            node.material.dispose();
        });
        
        this.edges.forEach(edge => {
            edge.geometry.dispose();
            edge.material.dispose();
        });
        
        if (this.octagonMesh) {
            this.octagonMesh.geometry.dispose();
            this.octagonMesh.material.dispose();
        }
        
        // Remove from scene
        this.scene.remove(this.group);
        
        // Clear arrays
        this.nodes.length = 0;
        this.edges.length = 0;
        this.nodePositions.length = 0;
        this.pulseWaves.length = 0;
    }
}