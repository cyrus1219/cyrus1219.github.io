class ChipMarkGenerator {
    constructor() {
        this.canvas = document.getElementById('chipCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // 芯片设置（单位：mm）
        this.chipWidth = 7;  // mm
        this.chipHeight = 7; // mm
        this.basePixelsPerMm = 100; // 基础比例：1mm = 100px
        this.pixelsPerMm = 100; // 当前显示比例
        this.maxCanvasSize = 700; // 画布最大显示尺寸（像素）
        
        this.chipBgColor = '#2c3e50';
        this.textColor = '#95a5a6';
        
        // Pin1 设置
        this.pin1 = {
            x: 50,
            y: 650,
            size: 25,
            dragging: false
        };
        
        // 文字行数据
        this.textLines = [];
        this.lineIdCounter = 0;
        this.draggedLine = null;
        
        // Logo 数据
        this.logos = [];
        this.logoIdCounter = 0;
        this.draggedLogo = null;
        
        // 对齐辅助线
        this.snapThreshold = 10;
        this.guideLines = [];
        
        // 字体高度补偿系数（实际高度/设置高度的比例）
        this.fontHeightCompensation = {
            'Arial': 0.717,  // 实际高度约为设置高度的 71.7% (100% - 28.3%)
            'OCR-A': 0.65  // 实际高度约为设置高度的 65% (100% - 35%)
        };
        
        this.init();
    }
    
    init() {
        this.loadFonts();
        this.updateCanvasSize();
        this.setupEventListeners();
        this.render();
    }
    
    // 加载字体
    async loadFonts() {
        try {
            // 等待字体加载完成
            await document.fonts.ready;
            // 预加载 OCR-A 字体
            await document.fonts.load('16px "OCR-A"');
            console.log('OCR-A 字体加载成功');
            // 等待一下确保字体完全加载
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            console.warn('OCR-A 字体加载失败:', error);
        }
    }
    
    setupEventListeners() {
        // 芯片尺寸设置
        document.getElementById('chipWidth').addEventListener('input', (e) => {
            this.chipWidth = parseFloat(e.target.value);
            this.updateCanvasSize();
            this.render();
        });
        
        document.getElementById('chipHeight').addEventListener('input', (e) => {
            this.chipHeight = parseFloat(e.target.value);
            this.updateCanvasSize();
            this.render();
        });
        
        // 颜色设置
        document.getElementById('chipBgColor').addEventListener('input', (e) => {
            this.chipBgColor = e.target.value;
            this.render();
        });
        
        document.getElementById('textColor').addEventListener('input', (e) => {
            this.textColor = e.target.value;
            this.recolorLogos();
            this.render();
        });
        
        // Pin1 大小
        document.getElementById('pin1Size').addEventListener('input', (e) => {
            this.pin1.size = parseInt(e.target.value);
            document.getElementById('pin1SizeValue').textContent = e.target.value;
            this.render();
        });
        
        // 添加行按钮
        document.getElementById('addLine').addEventListener('click', () => {
            this.addTextLine();
        });
        
        // Logo 上传
        document.getElementById('logoUpload').addEventListener('change', (e) => {
            this.handleLogoUpload(e);
        });
        
        // 模板保存和导入
        document.getElementById('saveTemplate').addEventListener('click', () => {
            this.saveTemplate();
        });
        
        document.getElementById('loadTemplate').addEventListener('change', (e) => {
            this.loadTemplate(e);
        });
        
        // Canvas 鼠标事件
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
    }
    
    updateCanvasSize() {
        // 计算理想尺寸
        const idealWidth = this.chipWidth * this.basePixelsPerMm;
        const idealHeight = this.chipHeight * this.basePixelsPerMm;
        
        // 计算缩放比例，确保画布不超过最大尺寸
        let scale = 1;
        if (idealWidth > this.maxCanvasSize || idealHeight > this.maxCanvasSize) {
            const scaleX = this.maxCanvasSize / idealWidth;
            const scaleY = this.maxCanvasSize / idealHeight;
            scale = Math.min(scaleX, scaleY);
        }
        
        // 应用缩放比例
        this.pixelsPerMm = this.basePixelsPerMm * scale;
        
        const newWidth = this.chipWidth * this.pixelsPerMm;
        const newHeight = this.chipHeight * this.pixelsPerMm;
        
        this.canvas.width = newWidth;
        this.canvas.height = newHeight;
        
        // 更新画布显示样式
        this.updateCanvasDisplay();
        
        // 调整所有元素位置，确保它们在新的画布范围内
        this.constrainElementsToCanvas();
    }
    
    updateCanvasDisplay() {
        // 显示当前缩放比例
        const scalePercent = Math.round((this.pixelsPerMm / this.basePixelsPerMm) * 100);
        const sizeInfo = document.getElementById('canvasSizeInfo');
        if (sizeInfo) {
            sizeInfo.textContent = `${this.chipWidth} × ${this.chipHeight} mm (缩放: ${scalePercent}%)`;
        }
    }
    
    constrainElementsToCanvas() {
        // 约束 Pin1 位置
        this.pin1.x = Math.max(this.pin1.size, Math.min(this.canvas.width - this.pin1.size, this.pin1.x));
        this.pin1.y = Math.max(this.pin1.size, Math.min(this.canvas.height - this.pin1.size, this.pin1.y));
        
        // 约束所有文字行位置
        for (const line of this.textLines) {
            const metrics = this.measureText(line);
            const charHeightPx = this.mmToPixels(line.charHeight);
            
            // 确保文字左边界在画布内
            line.x = Math.max(0, Math.min(this.canvas.width - metrics.width, line.x));
            
            // 确保文字上下边界在画布内
            line.y = Math.max(charHeightPx, Math.min(this.canvas.height, line.y));
        }
    }
    
    // 将 mm 转换为像素
    mmToPixels(mm) {
        return mm * this.pixelsPerMm;
    }
    
    addTextLine(text = '新文字', x = null, y = null) {
        const id = this.lineIdCounter++;
        
        // 如果没有指定位置，使用画布中心
        if (x === null || y === null) {
            x = this.canvas.width / 2;
            y = this.canvas.height / 2;
        }
        
        const line = {
            id,
            text,
            x,
            y,
            charWidth: 0.4,  // mm
            charHeight: 0.6, // mm
            fontFamily: 'Arial',
            letterSpacing: 0.15, // mm
            bold: false,
            underline: false,
            dragging: false
        };
        
        // 确保新行在画布范围内
        const metrics = this.measureText(line);
        const charHeightPx = this.mmToPixels(line.charHeight);
        line.x = Math.max(0, Math.min(this.canvas.width - metrics.width, line.x));
        line.y = Math.max(charHeightPx, Math.min(this.canvas.height, line.y));
        
        this.textLines.push(line);
        this.createLineControl(line);
        this.render();
    }
    
    createLineControl(line) {
        const container = document.getElementById('textLines');
        const lineDiv = document.createElement('div');
        lineDiv.className = 'text-line';
        lineDiv.id = `line-${line.id}`;
        
        lineDiv.innerHTML = `
            <div class="text-line-header">
                <span class="text-line-title">文字行 ${line.id + 1}</span>
                <button class="delete-line" onclick="generator.deleteLine(${line.id})">删除</button>
            </div>
            <div class="control-group">
                <label>内容：</label>
                <input type="text" value="${line.text}" 
                    onchange="generator.updateLineText(${line.id}, this.value)">
            </div>
            <div class="control-row">
                <div class="control-group">
                    <label>字宽 (mm)：</label>
                    <input type="number" value="${line.charWidth}" min="0.05" max="2" step="0.01"
                        onchange="generator.updateLineCharWidth(${line.id}, this.value)">
                </div>
                <div class="control-group">
                    <label>字高 (mm)：</label>
                    <input type="number" value="${line.charHeight}" min="0.05" max="2" step="0.01"
                        onchange="generator.updateLineCharHeight(${line.id}, this.value)">
                </div>
            </div>
            <div class="control-row">
                <div class="control-group">
                    <label>字间距 (mm)：</label>
                    <input type="number" value="${line.letterSpacing}" min="0" max="0.5" step="0.01"
                        onchange="generator.updateLineLetterSpacing(${line.id}, this.value)">
                </div>
                <div class="control-group">
                    <label>字体：</label>
                    <select onchange="generator.updateLineFontFamily(${line.id}, this.value)">
                        <option value="Arial" ${line.fontFamily === 'Arial' ? 'selected' : ''}>Arial</option>
                        <option value="OCR-A" ${line.fontFamily === 'OCR-A' ? 'selected' : ''}>OCR-A</option>
                    </select>
                </div>
            </div>
            <div class="control-row">
                <div class="control-group">
                    <label style="display: flex; align-items: center; gap: 5px;">
                        <input type="checkbox" ${line.bold ? 'checked' : ''} 
                            onchange="generator.updateLineBold(${line.id}, this.checked)">
                        加粗
                    </label>
                </div>
                <div class="control-group">
                    <label style="display: flex; align-items: center; gap: 5px;">
                        <input type="checkbox" ${line.underline ? 'checked' : ''} 
                            onchange="generator.updateLineUnderline(${line.id}, this.checked)">
                        下划线
                    </label>
                </div>
            </div>
        `;
        
        container.appendChild(lineDiv);
    }
    
    updateLineText(id, text) {
        const line = this.textLines.find(l => l.id === id);
        if (line) {
            line.text = text;
            this.render();
        }
    }
    
    updateLineCharWidth(id, width) {
        const line = this.textLines.find(l => l.id === id);
        if (line) {
            line.charWidth = parseFloat(width);
            this.render();
        }
    }
    
    updateLineCharHeight(id, height) {
        const line = this.textLines.find(l => l.id === id);
        if (line) {
            line.charHeight = parseFloat(height);
            this.render();
        }
    }
    
    updateLineLetterSpacing(id, spacing) {
        const line = this.textLines.find(l => l.id === id);
        if (line) {
            line.letterSpacing = parseFloat(spacing);
            this.render();
        }
    }
    
    updateLineFontFamily(id, family) {
        const line = this.textLines.find(l => l.id === id);
        if (line) {
            line.fontFamily = family;
            this.render();
        }
    }
    
    updateLineBold(id, bold) {
        const line = this.textLines.find(l => l.id === id);
        if (line) {
            line.bold = bold;
            this.render();
        }
    }
    
    updateLineUnderline(id, underline) {
        const line = this.textLines.find(l => l.id === id);
        if (line) {
            line.underline = underline;
            this.render();
        }
    }
    
    deleteLine(id) {
        this.textLines = this.textLines.filter(l => l.id !== id);
        document.getElementById(`line-${id}`).remove();
        this.render();
    }
    
    handleLogoUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                this.addLogo(img);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }
    
    addLogo(image) {
        const id = this.logoIdCounter++;
        
        // 创建临时画布来处理图片颜色
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = image.width;
        tempCanvas.height = image.height;
        const tempCtx = tempCanvas.getContext('2d');
        
        // 绘制原始图片
        tempCtx.drawImage(image, 0, 0);
        
        // 获取图片数据
        const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const data = imageData.data;
        
        // 将印字颜色转换为 RGB
        const targetColor = this.hexToRgb(this.textColor);
        
        // 遍历每个像素，将非透明像素替换为目标颜色
        for (let i = 0; i < data.length; i += 4) {
            const alpha = data[i + 3];
            if (alpha > 0) {
                // 保持原始透明度，但改变颜色
                data[i] = targetColor.r;     // R
                data[i + 1] = targetColor.g; // G
                data[i + 2] = targetColor.b; // B
                // data[i + 3] 保持不变（透明度）
            }
        }
        
        // 将修改后的数据放回画布
        tempCtx.putImageData(imageData, 0, 0);
        
        // 创建新的图片对象
        const coloredImage = new Image();
        coloredImage.src = tempCanvas.toDataURL();
        
        const logo = {
            id,
            image: coloredImage,
            originalImage: image, // 保存原始图片以便重新着色
            x: this.canvas.width / 2,
            y: this.canvas.height / 2,
            width: 2,  // mm
            height: 2, // mm
            dragging: false
        };
        
        this.logos.push(logo);
        this.createLogoControl(logo);
        this.render();
    }
    
    // 将十六进制颜色转换为 RGB
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 149, g: 165, b: 166 }; // 默认颜色
    }
    
    // 重新着色所有 Logo
    recolorLogos() {
        for (const logo of this.logos) {
            if (!logo.originalImage) continue;
            
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = logo.originalImage.width;
            tempCanvas.height = logo.originalImage.height;
            const tempCtx = tempCanvas.getContext('2d');
            
            tempCtx.drawImage(logo.originalImage, 0, 0);
            const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
            const data = imageData.data;
            
            const targetColor = this.hexToRgb(this.textColor);
            
            for (let i = 0; i < data.length; i += 4) {
                const alpha = data[i + 3];
                if (alpha > 0) {
                    data[i] = targetColor.r;
                    data[i + 1] = targetColor.g;
                    data[i + 2] = targetColor.b;
                }
            }
            
            tempCtx.putImageData(imageData, 0, 0);
            
            const coloredImage = new Image();
            coloredImage.src = tempCanvas.toDataURL();
            logo.image = coloredImage;
        }
    }
    
    createLogoControl(logo) {
        const container = document.getElementById('logos');
        const logoDiv = document.createElement('div');
        logoDiv.className = 'text-line';
        logoDiv.id = `logo-${logo.id}`;
        
        logoDiv.innerHTML = `
            <div class="text-line-header">
                <span class="text-line-title">Logo ${logo.id + 1}</span>
                <button class="delete-line" onclick="generator.deleteLogo(${logo.id})">删除</button>
            </div>
            <div class="control-row">
                <div class="control-group">
                    <label>宽度 (mm)：</label>
                    <input type="number" value="${logo.width}" min="0.1" max="10" step="0.1"
                        onchange="generator.updateLogoWidth(${logo.id}, this.value)">
                </div>
                <div class="control-group">
                    <label>高度 (mm)：</label>
                    <input type="number" value="${logo.height}" min="0.1" max="10" step="0.1"
                        onchange="generator.updateLogoHeight(${logo.id}, this.value)">
                </div>
            </div>
        `;
        
        container.appendChild(logoDiv);
    }
    
    updateLogoWidth(id, width) {
        const logo = this.logos.find(l => l.id === id);
        if (logo) {
            logo.width = parseFloat(width);
            this.render();
        }
    }
    
    updateLogoHeight(id, height) {
        const logo = this.logos.find(l => l.id === id);
        if (logo) {
            logo.height = parseFloat(height);
            this.render();
        }
    }
    
    deleteLogo(id) {
        this.logos = this.logos.filter(l => l.id !== id);
        document.getElementById(`logo-${id}`).remove();
        this.render();
    }
    
    // 保存模板
    async saveTemplate() {
        const template = {
            version: '1.0',
            chipWidth: this.chipWidth,
            chipHeight: this.chipHeight,
            chipBgColor: this.chipBgColor,
            textColor: this.textColor,
            pin1: {
                x: this.pin1.x,
                y: this.pin1.y,
                size: this.pin1.size
            },
            textLines: this.textLines.map(line => ({
                text: line.text,
                x: line.x,
                y: line.y,
                charWidth: line.charWidth,
                charHeight: line.charHeight,
                fontFamily: line.fontFamily,
                letterSpacing: line.letterSpacing,
                bold: line.bold,
                underline: line.underline
            })),
            logos: this.logos.map(logo => ({
                imageData: logo.originalImage ? logo.originalImage.src : logo.image.src,
                x: logo.x,
                y: logo.y,
                width: logo.width,
                height: logo.height
            }))
        };
        
        const json = JSON.stringify(template, null, 2);
        const defaultName = `chip-marking-template-${new Date().toISOString().slice(0, 10)}.json`;
        
        // 检查浏览器是否支持 File System Access API
        if ('showSaveFilePicker' in window) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: defaultName,
                    types: [{
                        description: 'JSON 文件',
                        accept: { 'application/json': ['.json'] }
                    }]
                });
                
                const writable = await handle.createWritable();
                await writable.write(json);
                await writable.close();
                
                alert('模板保存成功！');
            } catch (err) {
                // 用户取消了保存
                if (err.name !== 'AbortError') {
                    console.error('保存失败:', err);
                    alert('保存失败，请重试');
                }
            }
        } else {
            // 降级方案：使用传统下载方式
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = defaultName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    }
    
    // 加载模板
    loadTemplate(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const template = JSON.parse(event.target.result);
                this.applyTemplate(template);
            } catch (error) {
                alert('模板文件格式错误，无法加载');
                console.error('Template load error:', error);
            }
        };
        reader.readAsText(file);
        
        // 重置文件输入，允许重复加载同一文件
        e.target.value = '';
    }
    
    // 应用模板
    applyTemplate(template) {
        // 清空现有内容
        this.textLines = [];
        this.logos = [];
        document.getElementById('textLines').innerHTML = '';
        document.getElementById('logos').innerHTML = '';
        
        // 应用芯片设置
        this.chipWidth = template.chipWidth || 7;
        this.chipHeight = template.chipHeight || 7;
        this.chipBgColor = template.chipBgColor || '#2c3e50';
        this.textColor = template.textColor || '#95a5a6';
        
        // 更新界面控件
        document.getElementById('chipWidth').value = this.chipWidth;
        document.getElementById('chipHeight').value = this.chipHeight;
        document.getElementById('chipBgColor').value = this.chipBgColor;
        document.getElementById('textColor').value = this.textColor;
        
        // 应用 Pin1 设置
        if (template.pin1) {
            this.pin1.x = template.pin1.x;
            this.pin1.y = template.pin1.y;
            this.pin1.size = template.pin1.size;
            document.getElementById('pin1Size').value = this.pin1.size;
            document.getElementById('pin1SizeValue').textContent = this.pin1.size;
        }
        
        // 重置计数器
        this.lineIdCounter = 0;
        this.logoIdCounter = 0;
        
        // 加载文字行
        if (template.textLines) {
            for (const lineData of template.textLines) {
                const id = this.lineIdCounter++;
                const line = {
                    id,
                    text: lineData.text,
                    x: lineData.x,
                    y: lineData.y,
                    charWidth: lineData.charWidth,
                    charHeight: lineData.charHeight,
                    fontFamily: lineData.fontFamily,
                    letterSpacing: lineData.letterSpacing,
                    bold: lineData.bold || false,
                    underline: lineData.underline || false,
                    dragging: false
                };
                this.textLines.push(line);
                this.createLineControl(line);
            }
        }
        
        // 加载 Logo
        if (template.logos) {
            for (const logoData of template.logos) {
                const img = new Image();
                img.onload = () => {
                    const id = this.logoIdCounter++;
                    
                    // 创建临时画布来处理图片颜色
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = img.width;
                    tempCanvas.height = img.height;
                    const tempCtx = tempCanvas.getContext('2d');
                    
                    tempCtx.drawImage(img, 0, 0);
                    const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
                    const data = imageData.data;
                    
                    const targetColor = this.hexToRgb(this.textColor);
                    
                    for (let i = 0; i < data.length; i += 4) {
                        const alpha = data[i + 3];
                        if (alpha > 0) {
                            data[i] = targetColor.r;
                            data[i + 1] = targetColor.g;
                            data[i + 2] = targetColor.b;
                        }
                    }
                    
                    tempCtx.putImageData(imageData, 0, 0);
                    
                    const coloredImage = new Image();
                    coloredImage.src = tempCanvas.toDataURL();
                    
                    const logo = {
                        id,
                        image: coloredImage,
                        originalImage: img,
                        x: logoData.x,
                        y: logoData.y,
                        width: logoData.width,
                        height: logoData.height,
                        dragging: false
                    };
                    
                    this.logos.push(logo);
                    this.createLogoControl(logo);
                    this.render();
                };
                img.src = logoData.imageData;
            }
        }
        
        // 更新画布
        this.updateCanvasSize();
        this.render();
    }
    
    handleMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        
        // 检查是否点击 Pin1
        const dx = x - this.pin1.x;
        const dy = y - this.pin1.y;
        if (Math.sqrt(dx * dx + dy * dy) <= this.pin1.size) {
            this.pin1.dragging = true;
            return;
        }
        
        // 检查是否点击 Logo
        for (let i = this.logos.length - 1; i >= 0; i--) {
            const logo = this.logos[i];
            const widthPx = this.mmToPixels(logo.width);
            const heightPx = this.mmToPixels(logo.height);
            
            if (x >= logo.x && x <= logo.x + widthPx &&
                y >= logo.y && y <= logo.y + heightPx) {
                logo.dragging = true;
                logo.dragOffsetX = x - logo.x;
                logo.dragOffsetY = y - logo.y;
                this.draggedLogo = logo;
                return;
            }
        }
        
        // 检查是否点击文字行
        for (let i = this.textLines.length - 1; i >= 0; i--) {
            const line = this.textLines[i];
            const metrics = this.measureText(line);
            const charHeightPx = this.mmToPixels(line.charHeight);
            
            if (x >= line.x - 10 && x <= line.x + metrics.width + 10 &&
                y >= line.y - charHeightPx && y <= line.y + 10) {
                line.dragging = true;
                line.dragOffsetX = x - line.x;
                line.dragOffsetY = y - line.y;
                this.draggedLine = line;
                break;
            }
        }
    }
    
    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        
        this.guideLines = [];
        
        if (this.pin1.dragging) {
            this.pin1.x = Math.max(this.pin1.size, Math.min(this.canvas.width - this.pin1.size, x));
            this.pin1.y = Math.max(this.pin1.size, Math.min(this.canvas.height - this.pin1.size, y));
            this.render();
            return;
        }
        
        if (this.draggedLogo) {
            let newX = x - this.draggedLogo.dragOffsetX;
            let newY = y - this.draggedLogo.dragOffsetY;
            
            const widthPx = this.mmToPixels(this.draggedLogo.width);
            const heightPx = this.mmToPixels(this.draggedLogo.height);
            
            newX = Math.max(0, Math.min(this.canvas.width - widthPx, newX));
            newY = Math.max(0, Math.min(this.canvas.height - heightPx, newY));
            
            this.draggedLogo.x = newX;
            this.draggedLogo.y = newY;
            this.render();
            return;
        }
        
        if (this.draggedLine) {
            let newX = x - this.draggedLine.dragOffsetX;
            let newY = y - this.draggedLine.dragOffsetY;
            
            const currentMetrics = this.measureText(this.draggedLine);
            const currentRightEdge = newX + currentMetrics.width;
            
            // 自动对齐到其他文字行
            for (const line of this.textLines) {
                if (line.id === this.draggedLine.id) continue;
                
                const lineMetrics = this.measureText(line);
                const lineRightEdge = line.x + lineMetrics.width;
                
                // 左边对齐
                if (Math.abs(newX - line.x) < this.snapThreshold) {
                    newX = line.x;
                    this.guideLines.push({ type: 'vertical', pos: line.x });
                }
                
                // 右边对齐
                if (Math.abs(currentRightEdge - lineRightEdge) < this.snapThreshold) {
                    newX = lineRightEdge - currentMetrics.width;
                    this.guideLines.push({ type: 'vertical', pos: lineRightEdge });
                }
                
                // Y 轴对齐
                if (Math.abs(newY - line.y) < this.snapThreshold) {
                    newY = line.y;
                    this.guideLines.push({ type: 'horizontal', pos: line.y });
                }
            }
            
            // 对齐到画布中心
            const centerX = this.canvas.width / 2;
            const centerY = this.canvas.height / 2;
            
            // 左边对齐到中心
            if (Math.abs(newX - centerX) < this.snapThreshold) {
                newX = centerX;
                this.guideLines.push({ type: 'vertical', pos: centerX });
            }
            
            // 右边对齐到中心
            if (Math.abs(currentRightEdge - centerX) < this.snapThreshold) {
                newX = centerX - currentMetrics.width;
                this.guideLines.push({ type: 'vertical', pos: centerX });
            }
            
            if (Math.abs(newY - centerY) < this.snapThreshold) {
                newY = centerY;
                this.guideLines.push({ type: 'horizontal', pos: centerY });
            }
            
            // 约束文字在画布范围内
            const charHeightPx = this.mmToPixels(this.draggedLine.charHeight);
            
            newX = Math.max(0, Math.min(this.canvas.width - currentMetrics.width, newX));
            newY = Math.max(charHeightPx, Math.min(this.canvas.height, newY));
            
            this.draggedLine.x = newX;
            this.draggedLine.y = newY;
            this.render();
        }
    }
    
    handleMouseUp() {
        this.pin1.dragging = false;
        if (this.draggedLine) {
            this.draggedLine.dragging = false;
            this.draggedLine = null;
        }
        if (this.draggedLogo) {
            this.draggedLogo.dragging = false;
            this.draggedLogo = null;
        }
        this.guideLines = [];
        this.render();
    }
    
    measureText(line) {
        const charWidthPx = this.mmToPixels(line.charWidth);
        const letterSpacingPx = this.mmToPixels(line.letterSpacing);
        const text = line.text;
        const width = text.length > 0 ? 
            text.length * charWidthPx + (text.length - 1) * letterSpacingPx : 0;
        const height = this.mmToPixels(line.charHeight);
        return { width, height };
    }
    
    render() {
        // 清空画布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制芯片背景
        this.ctx.fillStyle = this.chipBgColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制对齐辅助线
        this.ctx.strokeStyle = '#ff6b6b';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([5, 5]);
        
        for (const guide of this.guideLines) {
            this.ctx.beginPath();
            if (guide.type === 'vertical') {
                this.ctx.moveTo(guide.pos, 0);
                this.ctx.lineTo(guide.pos, this.canvas.height);
            } else {
                this.ctx.moveTo(0, guide.pos);
                this.ctx.lineTo(this.canvas.width, guide.pos);
            }
            this.ctx.stroke();
        }
        
        this.ctx.setLineDash([]);
        
        // 绘制 Logo
        for (const logo of this.logos) {
            const widthPx = this.mmToPixels(logo.width);
            const heightPx = this.mmToPixels(logo.height);
            
            this.ctx.drawImage(logo.image, logo.x, logo.y, widthPx, heightPx);
            
            // 如果正在拖动，显示边框
            if (logo.dragging) {
                this.ctx.strokeStyle = '#3498db';
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(logo.x - 5, logo.y - 5, widthPx + 10, heightPx + 10);
            }
        }
        
        // 绘制文字
        this.ctx.fillStyle = this.textColor;
        
        for (const line of this.textLines) {
            const charHeightPx = this.mmToPixels(line.charHeight);
            const charWidthPx = this.mmToPixels(line.charWidth);
            const letterSpacingPx = this.mmToPixels(line.letterSpacing);
            
            // 应用字体高度补偿，使实际渲染高度等于用户设置的高度
            const compensation = this.fontHeightCompensation[line.fontFamily] || 0.7;
            const compensatedHeightPx = charHeightPx / compensation;
            
            // 设置字体样式（使用补偿后的高度）
            const fontWeight = line.bold ? 'bold' : 'normal';
            const fontString = `${fontWeight} ${compensatedHeightPx}px "${line.fontFamily}"`;
            
            // 绘制带字间距和字宽缩放的文字
            let currentX = line.x;
            for (const char of line.text) {
                this.ctx.save();
                
                // 在 save 之后设置字体，确保字体设置不会被 restore 清除
                this.ctx.font = fontString;
                
                // 计算实际字符宽度和目标宽度的比例
                const actualCharWidth = this.ctx.measureText(char).width;
                const scaleX = charWidthPx / actualCharWidth;
                
                // 应用水平缩放
                this.ctx.translate(currentX, line.y);
                this.ctx.scale(scaleX, 1);
                this.ctx.fillText(char, 0, 0);
                
                this.ctx.restore();
                
                currentX += charWidthPx + letterSpacingPx;
            }
            
            // 绘制下划线
            if (line.underline) {
                const metrics = this.measureText(line);
                const underlineY = line.y + charHeightPx * 0.1;
                this.ctx.strokeStyle = this.textColor;
                this.ctx.lineWidth = Math.max(1, charHeightPx * 0.05);
                this.ctx.beginPath();
                this.ctx.moveTo(line.x, underlineY);
                this.ctx.lineTo(line.x + metrics.width, underlineY);
                this.ctx.stroke();
            }
            
            // 如果正在拖动，显示边框
            if (line.dragging) {
                const metrics = this.measureText(line);
                this.ctx.strokeStyle = '#3498db';
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(line.x - 5, line.y - charHeightPx, 
                    metrics.width + 10, charHeightPx + 10);
            }
        }
        
        // 绘制 Pin1
        this.ctx.fillStyle = this.textColor;
        this.ctx.beginPath();
        this.ctx.arc(this.pin1.x, this.pin1.y, this.pin1.size / 2, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Pin1 拖动时显示边框
        if (this.pin1.dragging) {
            this.ctx.strokeStyle = '#3498db';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(this.pin1.x, this.pin1.y, this.pin1.size / 2 + 5, 0, Math.PI * 2);
            this.ctx.stroke();
        }
    }
}

// 初始化
let generator;
window.addEventListener('DOMContentLoaded', () => {
    generator = new ChipMarkGenerator();
});
