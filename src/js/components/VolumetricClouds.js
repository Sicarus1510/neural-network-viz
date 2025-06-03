import * as THREE from 'three';

export class VolumetricClouds {
    constructor(scene, params) {
        this.scene = scene;
        this.params = params;
        this.clouds = [];
        this.cloudGroup = new THREE.Group();
        
        this.init();
        this.scene.add(this.cloudGroup);
    }
    
    init() {
        this.createCloudTexture();
        this.createCloudSprites();
    }
    
    createCloudTexture() {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        // Create gradient for cloud texture
        const gradient = ctx.createRadialGradient(
            size / 2, size / 2, 0,
            size / 2, size / 2, size / 2
        );
        
        gradient.addColorStop(0, 'rgba(20, 20, 20, 0.8)');
        gradient.addColorStop(0.4, 'rgba(40, 40, 40, 0.5)');
        gradient.addColorStop(0.7, 'rgba(60, 60, 60, 0.2)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
        
        // Add noise pattern
        const imageData = ctx.getImageData(0, 0, size, size);
        const data = imageData.data;
        
        for (let i = 0; i < data.length; i += 4) {
            const noise = Math.random() * 30;
            data[i] = Math.max(0, data[i] - noise);
            data[i + 1] = Math.max(0, data[i + 1] - noise);
            data[i + 2] = Math.max(0, data[i + 2] - noise);
        }
        
        ctx.putImageData(imageData, 0, 0);
        
        this.cloudTexture = new THREE.CanvasTexture(canvas);
        this.cloudTexture.needsUpdate = true;
    }
    
    createCloudSprites() {
        const cloudCount = 30;
        
        for (let i = 0; i < cloudCount; i++) {
            const spriteMaterial = new THREE.SpriteMaterial({
                map: this.cloudTexture,
                color: 0x222222,
                opacity: this.params.cloudOpacity * (0.3 + Math.random() * 0.7),
                transparent: true,
                blending: THREE.NormalBlending,
                depthWrite: false,
                depthTest: true,
                fog: true
            });
            
            const sprite = new THREE.Sprite(spriteMaterial);
            
            // Position in center area
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * 3;
            const height = (Math.random() - 0.5) * 2;
            
            sprite.position.set(
                Math.cos(angle) * radius,
                height,
                Math.sin(angle) * radius
            );
            
            // Random scale
            const scale = 3 + Math.random() * 4;
            sprite.scale.set(scale, scale, 1);
            
            // Store animation data
            sprite.userData = {
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.02,
                    (Math.random() - 0.5) * 0.01,
                    (Math.random() - 0.5) * 0.02
                ),
                rotationSpeed: (Math.random() - 0.5) * 0.001,
                baseScale: scale,
                phaseOffset: Math.random() * Math.PI * 2
            };
            
            this.clouds.push(sprite);
            this.cloudGroup.add(sprite);
        }
        
        // Sort by depth for proper rendering
        this.sortCloudsByDepth();
    }
    
    sortCloudsByDepth() {
        // Sort clouds from back to front relative to camera
        this.clouds.sort((a, b) => {
            const camera = this.scene.getObjectByProperty('type', 'PerspectiveCamera');
            if (!camera) return 0;
            
            const distA = camera.position.distanceTo(a.position);
            const distB = camera.position.distanceTo(b.position);
            
            return distB - distA;
        });
        
        // Update render order
        this.clouds.forEach((cloud, index) => {
            cloud.renderOrder = index;
        });
    }
    
    update(elapsedTime, deltaTime) {
        this.clouds.forEach(cloud => {
            // Animate position
            cloud.position.add(
                cloud.userData.velocity.clone().multiplyScalar(deltaTime * 60)
            );
            
            // Keep within bounds
            const maxRadius = 5;
            const distFromCenter = Math.sqrt(
                cloud.position.x ** 2 + cloud.position.z ** 2
            );
            
            if (distFromCenter > maxRadius) {
                const angle = Math.atan2(cloud.position.z, cloud.position.x);
                cloud.position.x = Math.cos(angle + Math.PI) * (maxRadius - 1);
                cloud.position.z = Math.sin(angle + Math.PI) * (maxRadius - 1);
            }
            
            // Animate scale (breathing effect)
            const breathScale = 1 + Math.sin(elapsedTime + cloud.userData.phaseOffset) * 0.1;
            cloud.scale.setScalar(cloud.userData.baseScale * breathScale);
            
            // Rotate sprite
            cloud.material.rotation += cloud.userData.rotationSpeed;
            
            // Update opacity based on density
            const centerDistance = cloud.position.length();
            const opacityMultiplier = 1 - (centerDistance / maxRadius) * 0.5;
            cloud.material.opacity = this.params.cloudOpacity * 
                opacityMultiplier * 
                (0.3 + Math.random() * 0.7);
        });
        
        // Periodically sort by depth
        if (Math.floor(elapsedTime) % 2 === 0) {
            this.sortCloudsByDepth();
        }
    }
    
    dispose() {
        this.clouds.forEach(cloud => {
            cloud.material.map.dispose();
            cloud.material.dispose();
        });
        
        this.scene.remove(this.cloudGroup);
    }
}