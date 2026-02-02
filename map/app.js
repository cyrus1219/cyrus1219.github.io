// 晶圆 Mapping 可视化工具
let currentMode = 'single';
let waferData = [];
let waferDataA = [];
let waferDataB = [];

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    setupSingleMode();
    setupCompareMode();
    updateLegend();
});

// 切换模式
function switchMode(mode, btn) {
    currentMode = mode;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    document.getElementById('singleMode').style.display = mode === 'single' ? 'block' : 'none';
    document.getElementById('compareMode').style.display = mode === 'compare' ? 'block' : 'none';
    document.getElementById('infoPanel').style.display = 'none';
    document.getElementById('downloadBtn').style.display = 'none';
    
    const canvas = document.getElementById('waferCanvas');
    canvas.width = 0;
    canvas.height = 0;
    
    waferDataA = [];
    waferDataB = [];
    document.getElementById('fileNameA').textContent = '';
    document.getElementById('fileNameB').textContent = '';
    document.getElementById('dropZoneA').classList.remove('has-file');
    document.getElementById('dropZoneB').classList.remove('has-file');
    document.getElementById('compareBtn').style.display = 'none';
    
    updateLegend();
}

// 设置单文件模式
function setupSingleMode() {
    const fileInput = document.getElementById('fileInput');
    const dropZone = document.getElementById('dropZone');
    
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            document.getElementById('fileName1').textContent = file.name;
            processFile(file, 'single');
        }
    });
    
    setupDragDrop(dropZone, (file) => {
        document.getElementById('fileName1').textContent = file.name;
        processFile(file, 'single');
    });
}

// 设置比对模式
function setupCompareMode() {
    const fileInputA = document.getElementById('fileInputA');
    const fileInputB = document.getElementById('fileInputB');
    const dropZoneA = document.getElementById('dropZoneA');
    const dropZoneB = document.getElementById('dropZoneB');
    
    fileInputA.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            document.getElementById('fileNameA').textContent = file.name;
            dropZoneA.classList.add('has-file');
            processFile(file, 'A');
        }
    });
    
    fileInputB.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            document.getElementById('fileNameB').textContent = file.name;
            dropZoneB.classList.add('has-file');
            processFile(file, 'B');
        }
    });
    
    setupDragDrop(dropZoneA, (file) => {
        document.getElementById('fileNameA').textContent = file.name;
        dropZoneA.classList.add('has-file');
        processFile(file, 'A');
    });
    
    setupDragDrop(dropZoneB, (file) => {
        document.getElementById('fileNameB').textContent = file.name;
        dropZoneB.classList.add('has-file');
        processFile(file, 'B');
    });
}


// 设置拖拽
function setupDragDrop(zone, callback) {
    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('dragover');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && file.name.endsWith('.txt')) callback(file);
    });
}

// 处理文件
function processFile(file, target) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const data = parseMapping(e.target.result);
        if (target === 'single') {
            waferData = data;
            if (data.length > 0) {
                updateInfo(data);
                drawWafer(data);
            }
        } else if (target === 'A') {
            waferDataA = data;
            checkCompareReady();
        } else if (target === 'B') {
            waferDataB = data;
            checkCompareReady();
        }
    };
    reader.readAsText(file);
}

// 检查是否可以比对
function checkCompareReady() {
    const btn = document.getElementById('compareBtn');
    btn.style.display = (waferDataA.length > 0 && waferDataB.length > 0) ? 'block' : 'none';
}

// 解析 Mapping 文件
function parseMapping(content) {
    const lines = content.split('\n');
    let data = [];
    let maxCols = 0;
    
    for (let line of lines) {
        line = line.trimEnd();
        if (/^[AX._\s]+$/.test(line) && line.length > 10) {
            const rowData = line.replace(/[_\s]/g, '.').split('');
            data.push(rowData);
            maxCols = Math.max(maxCols, rowData.length);
        }
    }
    
    return data.map(row => {
        while (row.length < maxCols) row.push('.');
        return row;
    });
}

// 统计信息
function getStats(data) {
    let good = 0, bad = 0;
    for (let row of data) {
        for (let cell of row) {
            if (cell === 'A') good++;
            else if (cell === 'X') bad++;
        }
    }
    return { good, bad, gross: good + bad };
}

// 更新信息面板
function updateInfo(data, diffCount = null) {
    const stats = getStats(data);
    const yieldRate = stats.gross > 0 ? ((stats.good / stats.gross) * 100).toFixed(2) : 0;
    
    let html = `
        <div class="info-item"><div class="info-label">总行数</div><div class="info-value">${data.length}</div></div>
        <div class="info-item"><div class="info-label">总列数</div><div class="info-value">${data[0]?.length || 0}</div></div>
        <div class="info-item"><div class="info-label">Gross Die</div><div class="info-value">${stats.gross}</div></div>
        <div class="info-item"><div class="info-label">良品数</div><div class="info-value" style="color:#00ff88">${stats.good}</div></div>
        <div class="info-item"><div class="info-label">不良品数</div><div class="info-value" style="color:#ff4757">${stats.bad}</div></div>
        <div class="info-item"><div class="info-label">良率</div><div class="info-value" style="color:#00d4ff">${yieldRate}%</div></div>
    `;
    
    if (diffCount !== null) {
        html += `<div class="info-item"><div class="info-label">差异位置</div><div class="info-value" style="color:#ffd700">${diffCount}</div></div>`;
    }
    
    const infoGrid = document.getElementById('infoGrid');
    infoGrid.innerHTML = html;
    infoGrid.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fit, minmax(120px, 1fr)); gap:15px;';
    
    document.querySelectorAll('.info-item').forEach(item => {
        item.style.cssText = 'background:rgba(255,255,255,0.05); padding:15px; border-radius:8px; text-align:center;';
    });
    document.querySelectorAll('.info-label').forEach(label => {
        label.style.cssText = 'font-size:0.8rem; color:rgba(255,255,255,0.6); margin-bottom:5px;';
    });
    document.querySelectorAll('.info-value').forEach(val => {
        val.style.cssText += 'font-size:1.2rem; font-weight:bold;';
    });
    
    document.getElementById('infoPanel').style.display = 'block';
    document.getElementById('infoPanel').style.cssText = 'display:block; background:rgba(255,255,255,0.1); border-radius:16px; padding:20px; margin-bottom:30px;';
}


// 比对文件
function compareFiles() {
    const rows = Math.max(waferDataA.length, waferDataB.length);
    const colsA = waferDataA[0]?.length || 0;
    const colsB = waferDataB[0]?.length || 0;
    const cols = Math.max(colsA, colsB);
    
    // 创建比对结果数据
    let compareData = [];
    let diffCount = 0;
    
    for (let r = 0; r < rows; r++) {
        let row = [];
        for (let c = 0; c < cols; c++) {
            const cellA = waferDataA[r]?.[c] || '.';
            const cellB = waferDataB[r]?.[c] || '.';
            
            // 判断是否是 die（A 或 X）
            const isDieA = (cellA === 'A' || cellA === 'X');
            const isDieB = (cellB === 'A' || cellB === 'X');
            
            if (isDieA !== isDieB) {
                // Gross die 位置不同（一个有 die，一个没有）
                row.push('D'); // D = Difference
                diffCount++;
            } else if (isDieA && isDieB && cellA !== cellB) {
                // 都有 die 但状态不同（A vs X）
                row.push('D');
                diffCount++;
            } else {
                row.push(cellA);
            }
        }
        compareData.push(row);
    }
    
    // 更新统计信息
    const statsA = getStats(waferDataA);
    const statsB = getStats(waferDataB);
    
    let html = `
        <div class="info-item"><div class="info-label">文件 A Gross Die</div><div class="info-value">${statsA.gross}</div></div>
        <div class="info-item"><div class="info-label">文件 B Gross Die</div><div class="info-value">${statsB.gross}</div></div>
        <div class="info-item"><div class="info-label">文件 A 良品</div><div class="info-value" style="color:#00ff88">${statsA.good}</div></div>
        <div class="info-item"><div class="info-label">文件 B 良品</div><div class="info-value" style="color:#00ff88">${statsB.good}</div></div>
        <div class="info-item"><div class="info-label">文件 A 不良品</div><div class="info-value" style="color:#ff4757">${statsA.bad}</div></div>
        <div class="info-item"><div class="info-label">文件 B 不良品</div><div class="info-value" style="color:#ff4757">${statsB.bad}</div></div>
        <div class="info-item"><div class="info-label">差异位置数</div><div class="info-value" style="color:#ffd700">${diffCount}</div></div>
    `;
    
    const infoGrid = document.getElementById('infoGrid');
    infoGrid.innerHTML = html;
    infoGrid.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fit, minmax(120px, 1fr)); gap:15px;';
    
    document.querySelectorAll('.info-item').forEach(item => {
        item.style.cssText = 'background:rgba(255,255,255,0.05); padding:15px; border-radius:8px; text-align:center;';
    });
    document.querySelectorAll('.info-label').forEach(label => {
        label.style.cssText = 'font-size:0.8rem; color:rgba(255,255,255,0.6); margin-bottom:5px;';
    });
    document.querySelectorAll('.info-value').forEach(val => {
        val.style.cssText += 'font-size:1.2rem; font-weight:bold;';
    });
    
    document.getElementById('infoPanel').style.display = 'block';
    document.getElementById('infoPanel').style.cssText = 'display:block; background:rgba(255,255,255,0.1); border-radius:16px; padding:20px; margin-bottom:30px;';
    
    // 绘制比对结果
    drawWafer(compareData, true);
    updateLegend(true);
}

// 绘制晶圆
function drawWafer(data, isCompare = false) {
    const canvas = document.getElementById('waferCanvas');
    const ctx = canvas.getContext('2d');
    
    const rows = data.length;
    const cols = data[0]?.length || 0;
    
    const maxCanvasSize = Math.min(window.innerWidth - 80, 800);
    const cellSize = Math.max(2, Math.floor(maxCanvasSize / Math.max(rows, cols)));
    
    const canvasWidth = cols * cellSize;
    const canvasHeight = rows * cellSize;
    
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const cell = data[row][col];
            const x = col * cellSize;
            const y = row * cellSize;
            
            let color = null;
            if (cell === 'A') {
                color = '#00ff88';
            } else if (cell === 'X') {
                color = '#ff4757';
            } else if (cell === 'D') {
                color = '#ffd700'; // 差异 - 黄色
            }
            
            if (color) {
                ctx.fillStyle = color;
                ctx.fillRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);
                ctx.strokeStyle = 'rgba(255,255,255,0.1)';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);
            }
        }
    }
    
    document.getElementById('downloadBtn').style.display = 'block';
    waferData = data;
}

// 更新图例
function updateLegend(isCompare = false) {
    const legend = document.getElementById('legend');
    let html = `
        <div style="display:flex; align-items:center; gap:8px;">
            <div style="width:20px; height:20px; border-radius:4px; background:#00ff88;"></div>
            <span>良品 (A)</span>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
            <div style="width:20px; height:20px; border-radius:4px; background:#ff4757;"></div>
            <span>不良品 (X)</span>
        </div>
    `;
    
    if (isCompare) {
        html += `
            <div style="display:flex; align-items:center; gap:8px;">
                <div style="width:20px; height:20px; border-radius:4px; background:#ffd700;"></div>
                <span>差异位置</span>
            </div>
        `;
    }
    
    legend.innerHTML = html;
}

// 下载图片
function downloadImage() {
    const canvas = document.getElementById('waferCanvas');
    const link = document.createElement('a');
    link.download = 'wafer-map.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
}

// 窗口大小改变时重绘
window.addEventListener('resize', () => {
    if (waferData.length > 0) {
        drawWafer(waferData, currentMode === 'compare');
    }
});
