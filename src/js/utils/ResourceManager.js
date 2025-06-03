import * as THREE from 'three';

export class ResourceManager {
    constructor() {
        this.loadingManager = new THREE.LoadingManager();
        this.textureLoader = new THREE.TextureLoader(this.loadingManager);
        this.textures = {};
        this.disposed = false;
        
        this.setupLoadingCallbacks();
    }
    
    setupLoadingCallbacks() {
        this.loadingManager.onStart = (url, itemsLoaded, itemsTotal) => {
            console.log(`Loading resource: ${url} (${itemsLoaded}/${itemsTotal})`);
        };
        
        this.loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
            const progress = (itemsLoaded / itemsTotal) * 100;
            
            // Dispatch custom event for loading progress
            window.dispatchEvent(new CustomEvent('resourceLoadProgress', {
                detail: { progress, url, itemsLoaded, itemsTotal }
            }));
        };
        
        this.loadingManager.onError = (url) => {
            console.error(`Failed to load resource: ${url}`);
        };
    }
    
    async loadTextures(texturePaths) {
        if (this.disposed) return {};
        
        const promises = Object.entries(texturePaths).map(([name, path]) => {
            return this.loadTexture(name, path);
        });
        
        try {
            await Promise.all(promises);
        } catch (error) {
            console.error('Failed to load some textures:', error);
        }
        
        return this.textures;
    }
    
    loadTexture(name, path) {
        return new Promise((resolve, reject) => {
            if (this.disposed) {
                reject(new Error('ResourceManager disposed'));
                return;
            }
            
            // Handle relative paths properly
            const fullPath = path.startsWith('./') ? path.slice(2) : path;
            
            this.textureLoader.load(
                fullPath,
                (texture) => {
                    // Optimize texture settings
                    texture.encoding = THREE.sRGBEncoding;
                    texture.minFilter = THREE.LinearMipmapLinearFilter;
                    texture.magFilter = THREE.LinearFilter;
                    texture.generateMipmaps = true;
                    texture.anisotropy = Math.min(16, this.getMaxAnisotropy());
                    texture.needsUpdate = true;
                    
                    this.textures[name] = texture;
                    console.log(`Texture loaded: ${name}`);
                    resolve(texture);
                },
                // Progress callback
                (xhr) => {
                    if (xhr.lengthComputable) {
                        const percentComplete = (xhr.loaded / xhr.total) * 100;
                        console.log(`Loading ${name}: ${Math.round(percentComplete)}%`);
                    }
                },
                // Error callback
                (error) => {
                    console.warn(`Failed to load texture ${name}, using fallback`);
                    
                    // Create fallback texture
                    const fallbackTexture = this.createFallbackTexture();
                    this.textures[name] = fallbackTexture;
                    resolve(fallbackTexture); // Resolve with fallback instead of rejecting
                }
            );
        });
    }
    
    createFallbackTexture() {
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
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        
        return texture;
    }
    
    getMaxAnisotropy() {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (gl) {
                const ext = gl.getExtension('EXT_texture_filter_anisotropic') ||
                           gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic') ||
                           gl.getExtension('MOZ_EXT_texture_filter_anisotropic');
                if (ext) {
                    return gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
                }
            }
        } catch (e) {
            console.warn('Failed to get max anisotropy:', e);
        }
        return 1;
    }
    
    dispose() {
        this.disposed = true;
        
        // Dispose all loaded textures
        Object.values(this.textures).forEach(texture => {
            if (texture && texture.dispose) {
                texture.dispose();
            }
        });
        
        // Clear texture cache
        this.textures = {};
    }
}