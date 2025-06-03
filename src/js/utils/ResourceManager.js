import * as THREE from 'three';

export class ResourceManager {
    constructor() {
        this.loadingManager = new THREE.LoadingManager();
        this.textureLoader = new THREE.TextureLoader(this.loadingManager);
        this.textures = {};
        
        this.setupLoadingCallbacks();
    }
    
    setupLoadingCallbacks() {
        this.loadingManager.onStart = (url, itemsLoaded, itemsTotal) => {
            console.log(`Started loading: ${url}`);
        };
        
        this.loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
            const progress = (itemsLoaded / itemsTotal) * 100;
            console.log(`Loading progress: ${progress.toFixed(2)}%`);
        };
        
        this.loadingManager.onError = (url) => {
            console.error(`Error loading: ${url}`);
        };
    }
    
    async loadTextures(texturePaths) {
        const promises = Object.entries(texturePaths).map(([name, path]) => {
            return this.loadTexture(name, path);
        });
        
        await Promise.all(promises);
        return this.textures;
    }
    
    loadTexture(name, path) {
        return new Promise((resolve, reject) => {
            this.textureLoader.load(
                path,
                (texture) => {
                    // Optimize texture settings
                    texture.encoding = THREE.sRGBEncoding;
                    texture.minFilter = THREE.LinearMipmapLinearFilter;
                    texture.magFilter = THREE.LinearFilter;
                    texture.generateMipmaps = true;
                    texture.anisotropy = 16;
                    
                    this.textures[name] = texture;
                    resolve(texture);
                },
                undefined,
                (error) => {
                    console.error(`Failed to load texture ${name}:`, error);
                    
                    // Create fallback texture
                    const canvas = document.createElement('canvas');
                    canvas.width = 64;
                    canvas.height = 64;
                    const ctx = canvas.getContext('2d');
                    
                    // Create gradient circle
                    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
                    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
                    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.5)');
                    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
                    
                    ctx.fillStyle = gradient;
                    ctx.fillRect(0, 0, 64, 64);
                    
                    const fallbackTexture = new THREE.CanvasTexture(canvas);
                    this.textures[name] = fallbackTexture;
                    resolve(fallbackTexture);
                }
            );
        });
    }
}