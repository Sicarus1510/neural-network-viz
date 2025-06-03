import * as THREE from 'three';
import { MeshLineGeometry, MeshLineMaterial } from '@lume/three-meshline';

export class NeuralNetworkMesh {
    constructor(scene, params) {
        this.scene = scene;
        this.params = params;
        this.group = new THREE.Group();
        this.nodes = [];
        this.edges = [];
        this.pulsingNodes = new Set();
        
        this.init();
        this.scene.add(this.group);
    }
    
    init() {
        this.createOctagonalStructure();
        this.createInternalNodes();
        this.createConnectingEdges();
        this.setupGlassMaterial();
    }
    
    createOctagonalStructure() {
        // Create main octagonal frame with depth
        const shape = new THREE.Shape();
        const radius = 8;
        const segments = 8;
        
        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            
            if (i === 0) {
                shape.moveTo(x, y);
            } else {
                shape.lineTo(x, y);
            }
        }
        
        // Extrude to create depth
        const extrudeSettings = {
            depth: 2,
            bevelEnabled: true,
            bevelThickness: 0.2,
            bevelSize: 0.1,
            bevelSegments: 3
        };
        
        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geometry.computeVertexNormals();
        
        // Glass material for the frame
        this.frameMaterial = new THREE.MeshPhysicalMaterial({
            color: 0x222222,
            metalness: 0.1,
            roughness: this.params.glassRoughness,
            transmission: this.params.glassTransmission,
            thickness: this.params.glassThickness,
            ior: this.params.glassIOR,
            clearcoat: 1,
            clearcoatRoughness: 0,
            envMapIntensity: 1,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide
        });
        
        this.frame = new THREE.Mesh(geometry, this.frameMaterial);
        this.frame.rotation.x = -Math.PI / 2;
        this.frame.castShadow = true;
        this.frame.receiveShadow = true;
        this.group.add(this.frame);
        
        // Add wireframe overlay
        const wireframeMaterial = new THREE.LineBasicMaterial({
            color: 0x444444,
            linewidth: 2,
            transparent: true,
            opacity: 0.5
        });
        
        const wireframeGeometry = new THREE.EdgesGeometry(geometry);
        const wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
        wireframe.rotation.x = -Math.PI / 2;
        this.group.add(wireframe);
    }
    
    createInternalNodes() {
        // Create node positions using a structured pattern
        const nodePositions = [];
        
        // Center node
        nodePositions.push(new THREE.Vector3(0, 0, 0));
        
        // Inner ring
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const radius = 3;
            nodePositions.push(new THREE.Vector3(
                Math.cos(angle) * radius,
                0,
                Math.sin(angle) * radius
            ));
        }
        
        // Outer ring
        for (let i = 0; i < 16; i++) {
            const angle = (i / 16) * Math.PI * 2;
            const radius = 6;
            const height = (Math.random() - 0.5) * 2;
            nodePositions.push(new THREE.Vector3(
                Math.cos(angle) * radius,
                height,
                Math.sin(angle) * radius
            ));
        }
        
        // Create node meshes
        const nodeGeometry = new THREE.IcosahedronGeometry(0.3, 2);
        const nodeMaterial = new THREE.MeshPhysicalMaterial({
            color: 0xffaa44,
            emissive: 0xff8800,
            emissiveIntensity: 0.5,
            metalness: 0.8,
            roughness: 0.2,
            clearcoat: 1,
            clearcoatRoughness: 0
        });
        
        nodePositions.forEach((pos, index) => {
            const node = new THREE.Mesh(nodeGeometry, nodeMaterial.clone());
            node.position.copy(pos);
            node.castShadow = true;
            node.userData = { index, basePosition: pos.clone() };
            
            this.nodes.push(node);
            this.group.add(node);
            
            // Add point light for glow effect
            const light = new THREE.PointLight(0xffaa44, 0.5, 3);
            light.position.copy(pos);
            this.group.add(light);
        });
    }
    
    createConnectingEdges() {
        // Create connections between nodes
        const connections = [];
        
        // Connect center to inner ring
        for (let i = 1; i <= 8; i++) {
            connections.push([0, i]);
        }
        
        // Connect inner ring
        for (let i = 1; i <= 8; i++) {
            const next = i === 8 ? 1 : i + 1;
            connections.push([i, next]);
        }
        
        // Connect inner to outer ring
        for (let i = 1; i <= 8; i++) {
            const outerStart = 9 + (i - 1) * 2;
            connections.push([i, outerStart]);
            connections.push([i, outerStart + 1]);
        }
        
        // Create edge meshes
        connections.forEach(([startIdx, endIdx]) => {
            const start = this.nodes[startIdx].position;
            const end = this.nodes[endIdx].position;
            
            const points = [];
            const segments = 20;
            
            for (let i = 0; i <= segments; i++) {
                const t = i / segments;
                const point = new THREE.Vector3().lerpVectors(start, end, t);
                
                // Add slight curve
                const midPoint = 0.5 - Math.abs(t - 0.5);
                point.y += midPoint * 0.5;
                
                points.push(point);
            }
            
            const geometry = new MeshLineGeometry();
            geometry.setPoints(points);
            
            const material = new MeshLineMaterial({
                color: 0x888888,
                lineWidth: 0.05,
                transparent: true,
                opacity: 0.6,
                dashArray: 0,
                dashOffset: 0,
                dashRatio: 0
            });
            
            const edge = new THREE.Mesh(geometry, material);
            edge.userData = { startIdx, endIdx };
            this.edges.push(edge);
            this.group.add(edge);
        });
    }
    
    setupGlassMaterial() {
        // Update frame material with environment
        if (this.scene.environment) {
            this.frameMaterial.envMap = this.scene.environment;
            this.frameMaterial.needsUpdate = true;
        }
    }
    
    pulseNode(node) {
        if (!node.userData.index !== undefined) return;
        
        this.pulsingNodes.add(node);
        
        // Animate node pulse
        const startScale = node.scale.x;
        const targetScale = startScale * 1.5;
        const duration = 500;
        const startTime = Date.now();
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            if (progress < 0.5) {
                const t = progress * 2;
                const scale = startScale + (targetScale - startScale) * t;
                node.scale.setScalar(scale);
                node.material.emissiveIntensity = 0.5 + t * 0.5;
            } else {
                const t = (progress - 0.5) * 2;
                const scale = targetScale - (targetScale - startScale) * t;
                node.scale.setScalar(scale);
                node.material.emissiveIntensity = 1 - t * 0.5;
            }
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                this.pulsingNodes.delete(node);
            }
        };
        
        animate();
    }
    
    update(elapsedTime, deltaTime) {
        // Animate nodes
        this.nodes.forEach((node, index) => {
            if (!this.pulsingNodes.has(node)) {
                // Gentle floating animation
                const offset = index * 0.5;
                node.position.y = node.userData.basePosition.y + 
                    Math.sin(elapsedTime + offset) * 0.1;
                
                // Rotate nodes
                node.rotation.y += deltaTime * 0.5;
            }
        });
        
        // Animate edges with energy flow
        this.edges.forEach((edge, index) => {
            const offset = index * 0.2;
            const dashOffset = (elapsedTime * this.params.particleSpeed + offset) % 1;
            edge.material.dashOffset = -dashOffset;
        });
        
        // Rotate entire structure slowly
        this.group.rotation.y += deltaTime * this.params.rotationSpeed * 0.1;
    }
    
    getInteractableObjects() {
        return this.nodes;
    }
    
    getNodePositions() {
        return this.nodes.map(node => node.position.clone());
    }
    
    getEdgeData() {
        return this.edges.map(edge => ({
            start: this.nodes[edge.userData.startIdx].position,
            end: this.nodes[edge.userData.endIdx].position
        }));
    }
    
    dispose() {
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
        
        this.scene.remove(this.group);
    }
}