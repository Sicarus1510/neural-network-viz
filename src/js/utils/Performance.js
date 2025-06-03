export class Performance {
    constructor() {
        this.fps = 0;
        this.ms = 0;
        this.frames = 0;
        this.prevTime = performance.now();
        
        if (process.env.NODE_ENV === 'development') {
            this.createPanel();
        }
    }
    
    begin() {
        this.beginTime = performance.now();
    }
    
    end() {
        this.frames++;
        const time = performance.now();
        
        this.ms = time - this.beginTime;
        
        if (time >= this.prevTime + 1000) {
            this.fps = (this.frames * 1000) / (time - this.prevTime);
            this.frames = 0;
            this.prevTime = time;
            
            if (this.panel) {
                this.updatePanel();
            }
        }
    }
    
    createPanel() {
        this.panel = document.createElement('div');
        this.panel.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            width: 80px;
            height: 48px;
            background: rgba(0,0,0,0.9);
            color: #fff;
            font-family: monospace;
            font-size: 12px;
            padding: 4px;
            pointer-events: none;
            z-index: 10000;
        `;
        document.body.appendChild(this.panel);
    }
    
    updatePanel() {
        this.panel.innerHTML = `
            <div>FPS: ${this.fps.toFixed(1)}</div>
            <div>MS: ${this.ms.toFixed(2)}</div>
        `;
    }
}