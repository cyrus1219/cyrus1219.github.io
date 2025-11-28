let workbook = null;
let processedData = null;
let originalFileName = '';

const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const processBtn = document.getElementById('processBtn');
const statusDiv = document.getElementById('status');
const preview = document.getElementById('preview');
const previewTable = document.getElementById('previewTable');

// 上传区域点击事件
uploadArea.addEventListener('click', () => {
    fileInput.click();
});

// 拖拽事件
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) {
        handleFile(file);
    }
});

// 文件选择事件
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        handleFile(file);
    }
});

// 处理按钮点击事件
processBtn.addEventListener('click', () => {
    if (processedData) {
        downloadExcel();
    }
});

// 处理文件
function handleFile(file) {
    showStatus('正在读取文件...', 'info');
    
    // 保存原文件名（去掉扩展名）
    originalFileName = file.name.replace(/\.[^/.]+$/, '');
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            workbook = XLSX.read(data, { type: 'array' });
            
            processExcel();
        } catch (error) {
            showStatus('读取文件失败: ' + error.message, 'error');
        }
    };
    reader.readAsArrayBuffer(file);
}



// 提取 PAD Coordinates 表格中的有效 PAD Number 和相关数据
function extractPadCoordinatesData(jsonData) {
    const padCoordinatesMap = new Map(); // key: pad number, value: {padName, col1, col2, col3, col4, headers}
    
    // 查找 "PAD Coordinates" 行
    let coordRowIndex = -1;
    for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        for (let j = 0; j < row.length; j++) {
            if (row[j] && row[j].toString().includes('PAD Coordinates')) {
                coordRowIndex = i;
                break;
            }
        }
        if (coordRowIndex !== -1) break;
    }
    
    if (coordRowIndex === -1) {
        console.log('未找到 PAD Coordinates 表格');
        return null;
    }
    
    // 查找表头行
    let headerRowIndex = coordRowIndex + 1;
    const headerRow = jsonData[headerRowIndex];
    
    let padNumCol = -1;
    let padNameCol = -1;
    
    for (let i = 0; i < headerRow.length; i++) {
        const cell = headerRow[i] ? headerRow[i].toString().trim() : '';
        if (cell.includes('PAD Number') || cell.includes('PAD number')) {
            padNumCol = i;
        }
        if (cell.includes('PAD Name') || cell.includes('PAD name')) {
            padNameCol = i;
        }
    }
    
    if (padNumCol === -1) {
        console.log('未找到 PAD Number 列');
        return null;
    }
    
    // 获取 PAD Number 后面四列的表头
    const extraHeaders = [];
    for (let i = 1; i <= 4; i++) {
        const header = headerRow[padNumCol + i] || `列${i}`;
        extraHeaders.push(header.toString().trim());
    }
    
    // 提取所有 PAD Number 和对应的数据
    for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        const padNum = row[padNumCol];
        
        if (padNum && padNum.toString().trim()) {
            // 遇到空行或新表格标题，停止
            if (padNum.toString().includes('PIN Configuration')) break;
            
            const padNumStr = padNum.toString().trim();
            const padName = padNameCol !== -1 ? (row[padNameCol] || '').toString().trim() : '';
            
            const extraData = {
                padName: padName,
                col1: row[padNumCol + 1] || '',
                col2: row[padNumCol + 2] || '',
                col3: row[padNumCol + 3] || '',
                col4: row[padNumCol + 4] || '',
                headers: extraHeaders
            };
            
            padCoordinatesMap.set(padNumStr, extraData);
        }
    }
    
    console.log(`找到 ${padCoordinatesMap.size} 个 PAD Coordinates 数据`);
    return { padCoordinatesMap, headers: extraHeaders };
}

// 尝试拆分可能包含千位分隔符的数字
function tryFixThousandSeparator(padNumber, validPads) {
    const numStr = padNumber.toString();
    
    // 如果长度小于4，不可能是千位分隔符问题
    if (numStr.length < 4) return [padNumber];
    
    // 尝试各种可能的拆分位置
    const possibilities = [];
    
    // 尝试每3位拆分（千位分隔符通常是3位）
    for (let i = 1; i < numStr.length; i++) {
        const part1 = numStr.substring(0, i);
        const part2 = numStr.substring(i);
        
        // 检查拆分后的数字是否都在有效列表中
        if (validPads.has(part1) && validPads.has(part2)) {
            possibilities.push([part1, part2]);
        }
    }
    
    // 尝试拆分成3个数字
    for (let i = 1; i < numStr.length - 1; i++) {
        for (let j = i + 1; j < numStr.length; j++) {
            const part1 = numStr.substring(0, i);
            const part2 = numStr.substring(i, j);
            const part3 = numStr.substring(j);
            
            if (validPads.has(part1) && validPads.has(part2) && validPads.has(part3)) {
                possibilities.push([part1, part2, part3]);
            }
        }
    }
    
    // 如果找到可能的拆分，返回第一个
    if (possibilities.length > 0) {
        console.log(`修正千位分隔符: ${padNumber} -> ${possibilities[0].join(', ')}`);
        return possibilities[0];
    }
    
    return [padNumber];
}

// 处理 Excel
function processExcel() {
    try {
        // 获取第一个 sheet
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
            showStatus('未找到任何 sheet', 'error');
            return;
        }
        const sheet1 = workbook.Sheets[firstSheetName];
        console.log(`使用第一个 sheet: ${firstSheetName}`);
        
        // 转换为 JSON
        const jsonData = XLSX.utils.sheet_to_json(sheet1, { header: 1, defval: '' });
        
        // 第一步：提取 PAD Coordinates 数据
        const padCoordinatesData = extractPadCoordinatesData(jsonData);
        const validPadNumbers = padCoordinatesData ? new Set(padCoordinatesData.padCoordinatesMap.keys()) : null;
        const padCoordinatesHeaders = padCoordinatesData ? padCoordinatesData.headers : [];
        
        // 查找 "PIN Configuration" 行
        let configRowIndex = -1;
        for (let i = 0; i < jsonData.length; i++) {
            const row = jsonData[i];
            for (let j = 0; j < row.length; j++) {
                if (row[j] && row[j].toString().includes('PIN Configuration')) {
                    configRowIndex = i;
                    break;
                }
            }
            if (configRowIndex !== -1) break;
        }
        
        if (configRowIndex === -1) {
            showStatus('未找到 "PIN Configuration"', 'error');
            return;
        }
        
        // 查找表头行
        let headerRowIndex = configRowIndex + 1;
        const headerRow = jsonData[headerRowIndex];
        
        // 查找列索引
        let pinNumberCol = -1;
        let pinNameCol = -1;
        let pinDescriptionCol = -1;
        let padToPadCol = -1;
        let padNumberCol = -1;
        
        for (let i = 0; i < headerRow.length; i++) {
            const cell = headerRow[i] ? headerRow[i].toString().trim() : '';
            if (cell.includes('PIN Number')) pinNumberCol = i;
            if (cell.includes('PIN Name')) pinNameCol = i;
            if (cell.includes('PIN Description') || cell.includes('PIN Discription')) pinDescriptionCol = i;
            if (cell.includes('PAD to PAD')) padToPadCol = i;
            if (cell.includes('PAD number')) padNumberCol = i;
        }
        
        if (pinNumberCol === -1 || pinNameCol === -1 || padNumberCol === -1) {
            showStatus('未找到必需的列: PIN Number, PIN Name, PAD number', 'error');
            return;
        }
        
        // 使用自动识别分隔符（逗号、分号、空格、顿号）
        const separatorPattern = /[,，;；、\s]+/;
        
        // 提取数据并拆分
        const result = [];
        let fixedCount = 0;
        
        for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            
            // 遇到空行（所有关键列都为空），停止读取
            if (!row[pinNumberCol] && !row[pinNameCol] && !row[padNumberCol]) {
                console.log(`在第 ${i + 1} 行遇到空行，停止读取 PIN Configuration 表格`);
                break;
            }
            
            const pinNumber = row[pinNumberCol] || '';
            const pinName = row[pinNameCol] || '';
            const pinDescription = pinDescriptionCol !== -1 ? (row[pinDescriptionCol] || '') : '';
            const padToPad = padToPadCol !== -1 ? (row[padToPadCol] || '') : '';
            const padNumbers = row[padNumberCol] ? row[padNumberCol].toString() : '';
            
            if (padNumbers) {
                // 先按分隔符拆分
                let pads = padNumbers.split(separatorPattern).filter(p => p.trim());
                
                // 如果有有效 PAD 列表，进行验证和修正
                if (validPadNumbers) {
                    const correctedPads = [];
                    
                    for (const pad of pads) {
                        const trimmedPad = pad.trim();
                        
                        // 如果这个 PAD 不在有效列表中，尝试修正
                        if (!validPadNumbers.has(trimmedPad)) {
                            const fixed = tryFixThousandSeparator(trimmedPad, validPadNumbers);
                            if (fixed.length > 1) {
                                fixedCount++;
                                correctedPads.push(...fixed);
                            } else {
                                correctedPads.push(trimmedPad);
                            }
                        } else {
                            correctedPads.push(trimmedPad);
                        }
                    }
                    
                    pads = correctedPads;
                }
                
                pads.forEach(pad => {
                    const padNum = pad.trim();
                    const coordData = padCoordinatesData ? padCoordinatesData.padCoordinatesMap.get(padNum) : null;
                    
                    const rowData = {
                        'PIN Number': pinNumber,
                        'PIN Name': pinName,
                        'PIN Description': pinDescription,
                        'PAD to PAD(pad name)': padToPad,
                        'PAD number': padNum
                    };
                    
                    // 添加 PAD Coordinates 的四列数据（第一列是 PAD Name）
                    let padNameValue = '';
                    if (coordData) {
                        rowData[coordData.headers[0]] = coordData.col1;
                        rowData[coordData.headers[1]] = coordData.col2;
                        rowData[coordData.headers[2]] = coordData.col3;
                        rowData[coordData.headers[3]] = coordData.col4;
                        padNameValue = coordData.col1.toString().trim(); // 第一列是 PAD Name
                    } else {
                        // 如果没有找到对应数据，填充空值
                        padCoordinatesHeaders.forEach(header => {
                            rowData[header] = '';
                        });
                    }
                    
                    // 添加比对fail列（比对第一列 PAD Name 和 PIN Name）
                    const pinNameValue = pinName.toString().trim();
                    // 只要两者不相同就显示 Y（包括空白的情况）
                    rowData['比对fail'] = (padNameValue !== pinNameValue) ? 'Y' : '';
                    
                    result.push(rowData);
                });
            } else {
                const rowData = {
                    'PIN Number': pinNumber,
                    'PIN Name': pinName,
                    'PIN Description': pinDescription,
                    'PAD to PAD(pad name)': padToPad,
                    'PAD number': ''
                };
                
                // 添加空的 PAD Coordinates 列
                padCoordinatesHeaders.forEach(header => {
                    rowData[header] = '';
                });
                
                // 添加比对fail列（没有 PAD number 的情况）
                rowData['比对fail'] = '';
                
                result.push(rowData);
            }
        }
        
        // 找出 PAD Coordinates 中有但 PIN Configuration 中缺少的 PAD number
        if (validPadNumbers) {
            const usedPadNumbers = new Set(result.map(r => r['PAD number']));
            const missingPads = [];
            
            validPadNumbers.forEach(pad => {
                if (!usedPadNumbers.has(pad)) {
                    const coordData = padCoordinatesData.padCoordinatesMap.get(pad);
                    
                    const rowData = {
                        'PIN Number': '',
                        'PIN Name': 'NC',
                        'PIN Description': '',
                        'PAD to PAD(pad name)': '',
                        'PAD number': pad
                    };
                    
                    // 添加 PAD Coordinates 的四列数据
                    let padNameValue = '';
                    if (coordData) {
                        rowData[coordData.headers[0]] = coordData.col1;
                        rowData[coordData.headers[1]] = coordData.col2;
                        rowData[coordData.headers[2]] = coordData.col3;
                        rowData[coordData.headers[3]] = coordData.col4;
                        padNameValue = coordData.col1.toString().trim(); // 第一列是 PAD Name
                    } else {
                        padCoordinatesHeaders.forEach(header => {
                            rowData[header] = '';
                        });
                    }
                    
                    // NC 行也需要比对：如果 PAD Name 不是 NC，则显示 Y
                    rowData['比对fail'] = (padNameValue !== 'NC') ? 'Y' : '';
                    
                    missingPads.push(rowData);
                }
            });
            
            if (missingPads.length > 0) {
                console.log(`发现 ${missingPads.length} 个未使用的 PAD numbers`);
                result.push(...missingPads);
            }
        }
        
        // 按 PAD number 排序
        result.sort((a, b) => {
            const padA = parseInt(a['PAD number']) || 0;
            const padB = parseInt(b['PAD number']) || 0;
            return padA - padB;
        });
        
        processedData = result;
        
        let message = `处理成功！共 ${result.length} 行数据`;
        if (fixedCount > 0) {
            message += `，自动修正了 ${fixedCount} 个千位分隔符错误`;
        }
        const ncCount = result.filter(r => r['PIN Name'] === 'NC').length;
        if (ncCount > 0) {
            message += `，发现 ${ncCount} 个未使用的 PAD`;
        }
        showStatus(message, 'success');
        processBtn.style.display = 'inline-block';
        
        // 显示预览
        showPreview(result);
        
    } catch (error) {
        showStatus('处理失败: ' + error.message, 'error');
        console.error(error);
    }
}

// 显示预览
function showPreview(data) {
    preview.style.display = 'block';
    
    if (data.length === 0) return;
    
    // 获取所有列名
    const columns = Object.keys(data[0]);
    
    let html = '<thead><tr>';
    columns.forEach(col => {
        html += `<th>${col}</th>`;
    });
    html += '</tr></thead><tbody>';
    
    const previewData = data.slice(0, 50);
    previewData.forEach(row => {
        const isNC = row['PIN Name'] === 'NC';
        const style = isNC ? ' style="color: red; font-weight: bold;"' : '';
        
        html += `<tr${style}>`;
        columns.forEach(col => {
            html += `<td${style}>${row[col] || ''}</td>`;
        });
        html += '</tr>';
    });
    
    html += '</tbody>';
    previewTable.innerHTML = html;
}

// 解析 PIN Number 坐标（如 K10 -> {col: 'K', row: 10}）
function parsePinNumber(pinNumber) {
    if (!pinNumber || typeof pinNumber !== 'string') return null;
    
    const match = pinNumber.trim().match(/^([A-Z]+)(\d+)$/i);
    if (!match) return null;
    
    return {
        col: match[1].toUpperCase(),
        row: parseInt(match[2])
    };
}

// 生成 Ball Map 矩阵
function generateBallMap(data) {
    const ballMap = new Map(); // key: "col_row", value: {pinName: string, count: number}
    const conflicts = []; // 记录冲突
    let maxCol = 'A';
    let maxRow = 1;
    
    // 收集所有坐标和对应的 PIN Name
    data.forEach(row => {
        const coord = parsePinNumber(row['PIN Number']);
        if (!coord) return;
        
        const key = `${coord.col}_${coord.row}`;
        const pinName = row['PIN Name'];
        
        // 更新最大列和行
        if (coord.col > maxCol) maxCol = coord.col;
        if (coord.row > maxRow) maxRow = coord.row;
        
        // 检查是否已存在
        if (ballMap.has(key)) {
            const existing = ballMap.get(key);
            if (existing.pinName !== pinName) {
                // 发现冲突
                conflicts.push({
                    position: `${coord.col}${coord.row}`,
                    existing: existing.pinName,
                    new: pinName
                });
            }
        } else {
            ballMap.set(key, { pinName, count: 1 });
        }
    });
    
    return { ballMap, maxCol, maxRow, conflicts };
}

// 列字母转数字（跳过 I, O, Q, S）A=1, B=2, ..., H=8, J=9, K=10, L=11, M=12, N=13, P=14, R=15, T=16, ...
function colToNum(col) {
    const skipLetters = ['I', 'O', 'Q', 'S']; // 跳过的字母
    let num = 0;
    
    for (let i = 0; i < col.length; i++) {
        let char = col[i].toUpperCase();
        let charValue = char.charCodeAt(0) - 64; // A=1, B=2, ...
        
        // 计算跳过的字母数量
        let skipped = 0;
        for (const skip of skipLetters) {
            if (char.charCodeAt(0) > skip.charCodeAt(0)) {
                skipped++;
            }
        }
        
        charValue -= skipped;
        num = num * 22 + charValue; // 22个字母（26 - 4）
    }
    return num;
}

// 数字转列字母（跳过 I, O, Q, S）
function numToCol(num) {
    const skipLetters = [73, 79, 81, 83]; // I=73, O=79, Q=81, S=83
    let col = '';
    
    while (num > 0) {
        const remainder = (num - 1) % 22;
        let charCode = 65 + remainder; // A=65
        
        // 跳过 I, O, Q, S
        for (const skip of skipLetters) {
            if (charCode >= skip) {
                charCode++;
            }
        }
        
        col = String.fromCharCode(charCode) + col;
        num = Math.floor((num - 1) / 22);
    }
    return col;
}

// 查找原始 Ball Map sheet
function findOriginalBallMapSheet() {
    if (!workbook) return null;
    
    for (const sheetName of workbook.SheetNames) {
        const lowerName = sheetName.toLowerCase();
        if (lowerName.includes('ball') && lowerName.includes('map')) {
            return { name: sheetName, sheet: workbook.Sheets[sheetName] };
        }
    }
    
    return null;
}

// 从原始 Ball Map 中提取数据
function extractOriginalBallMap(sheet) {
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const ballMapData = new Map();
    
    // 查找数据区域（跳过表头）
    let dataStartRow = -1;
    let colLetters = [];
    
    // 找到第一行包含数字的行（列号行）
    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        // 检查是否是列号行（第二列开始是数字）
        if (row[1] && !isNaN(row[1])) {
            dataStartRow = i + 1;
            // 提取列号
            for (let j = 1; j < row.length; j++) {
                if (row[j] && !isNaN(row[j])) {
                    colLetters.push(parseInt(row[j]));
                } else {
                    break;
                }
            }
            break;
        }
    }
    
    if (dataStartRow === -1) return ballMapData;
    
    // 提取数据
    for (let i = dataStartRow; i < data.length; i++) {
        const row = data[i];
        const rowLetter = row[0] ? row[0].toString().trim().toUpperCase() : '';
        
        // 如果第一列不是字母，说明数据区域结束
        if (!rowLetter || !/^[A-Z]+$/.test(rowLetter)) break;
        
        // 提取该行的数据
        for (let j = 0; j < colLetters.length; j++) {
            const colNum = colLetters[j];
            const cellValue = row[j + 1] ? row[j + 1].toString().trim() : '';
            const key = `${rowLetter}_${colNum}`;
            ballMapData.set(key, cellValue);
        }
    }
    
    return ballMapData;
}

// 对比两个 Ball Map
function compareBallMaps(newBallMap, originalBallMap) {
    const differences = [];
    
    // 检查新 Ball Map 中的每个单元格
    newBallMap.forEach((value, key) => {
        const [col, row] = key.split('_');
        const originalValue = originalBallMap.get(key) || '';
        
        if (value.pinName !== originalValue) {
            differences.push({
                position: `${col}${row}`,
                original: originalValue,
                new: value.pinName
            });
        }
    });
    
    // 检查原始 Ball Map 中有但新 Ball Map 中没有的单元格
    originalBallMap.forEach((value, key) => {
        if (!newBallMap.has(key) && value) {
            const [col, row] = key.split('_');
            differences.push({
                position: `${col}${row}`,
                original: value,
                new: ''
            });
        }
    });
    
    return differences;
}

// 创建 Ball Map 工作表
function createBallMapSheet(data) {
    const { ballMap, maxCol, maxRow, conflicts } = generateBallMap(data);
    
    const maxColNum = colToNum(maxCol);
    
    // 创建矩阵数组
    const matrix = [];
    
    // 第一行：空白 + 列号（1, 2, 3, ...）
    const headerRow = [''];
    for (let i = 1; i <= maxRow; i++) {
        headerRow.push(i.toString());
    }
    headerRow.push(''); // 右侧也加一列字母
    matrix.push(headerRow);
    
    // 数据行：行字母 + 数据 + 行字母
    for (let colNum = 1; colNum <= maxColNum; colNum++) {
        const col = numToCol(colNum);
        const dataRow = [col];
        
        for (let row = 1; row <= maxRow; row++) {
            const key = `${col}_${row}`;
            const cell = ballMap.get(key);
            dataRow.push(cell ? cell.pinName : '');
        }
        
        dataRow.push(col); // 右侧也显示行字母
        matrix.push(dataRow);
    }
    
    // 最后一行：空白 + 列号
    const footerRow = [''];
    for (let i = 1; i <= maxRow; i++) {
        footerRow.push(i.toString());
    }
    footerRow.push('');
    matrix.push(footerRow);
    
    // 创建工作表
    const ws = XLSX.utils.aoa_to_sheet(matrix);
    
    // 设置列宽
    const cols = [{ wch: 5 }]; // 第一列（行字母）
    for (let i = 0; i <= maxRow; i++) {
        cols.push({ wch: 12 });
    }
    ws['!cols'] = cols;
    
    let currentRow = matrix.length + 2;
    
    // 添加冲突信息（如果有）
    if (conflicts.length > 0) {
        XLSX.utils.sheet_add_aoa(ws, [['⚠️ 发现坐标冲突：']], { origin: `A${currentRow}` });
        currentRow++;
        
        conflicts.forEach((conflict) => {
            XLSX.utils.sheet_add_aoa(ws, [[
                `位置 ${conflict.position}:`,
                `已有 "${conflict.existing}"`,
                `新的 "${conflict.new}"`
            ]], { origin: `A${currentRow}` });
            currentRow++;
        });
        currentRow++;
    }
    
    // 对比原始 Ball Map
    const originalBallMapSheet = findOriginalBallMapSheet();
    let differences = [];
    
    if (originalBallMapSheet) {
        console.log(`找到原始 Ball Map: ${originalBallMapSheet.name}`);
        const originalBallMap = extractOriginalBallMap(originalBallMapSheet.sheet);
        differences = compareBallMaps(ballMap, originalBallMap);
        
        if (differences.length > 0) {
            XLSX.utils.sheet_add_aoa(ws, [['⚠️ 与原始 Ball Map 的差异：']], { origin: `A${currentRow}` });
            currentRow++;
            XLSX.utils.sheet_add_aoa(ws, [['位置', '原始值', '新值']], { origin: `A${currentRow}` });
            currentRow++;
            
            differences.forEach((diff) => {
                XLSX.utils.sheet_add_aoa(ws, [[
                    diff.position,
                    diff.original,
                    diff.new
                ]], { origin: `A${currentRow}` });
                currentRow++;
            });
        }
    }
    
    return { ws, conflicts, differences };
}

// 下载 Excel
function downloadExcel() {
    try {
        // 创建新的工作簿
        const newWorkbook = XLSX.utils.book_new();
        
        // 1. 创建 "pad no 排序" 工作表
        // 使用 json_to_sheet 保留所有列
        const ws1 = XLSX.utils.json_to_sheet(processedData);
        
        // 设置列宽
        const colWidths = [];
        if (processedData.length > 0) {
            Object.keys(processedData[0]).forEach(() => {
                colWidths.push({ wch: 15 });
            });
        }
        ws1['!cols'] = colWidths;
        
        // 为 NC 行和比对fail列设置样式
        processedData.forEach((row, index) => {
            const rowIndex = index + 2;
            const isNC = row['PIN Name'] === 'NC';
            
            if (isNC) {
                // NC 行所有单元格设置红色
                const colCount = Object.keys(row).length;
                for (let i = 0; i < colCount; i++) {
                    const colLetter = String.fromCharCode(65 + i); // A, B, C, ...
                    const cellAddr = `${colLetter}${rowIndex}`;
                    if (!ws1[cellAddr]) ws1[cellAddr] = { v: '', t: 's' };
                    if (!ws1[cellAddr].s) ws1[cellAddr].s = {};
                    ws1[cellAddr].s.font = { color: { rgb: "FF0000" } };
                }
            }
            
            // 如果比对fail列为Y，设置该单元格为红色
            if (row['比对fail'] === 'Y') {
                const columns = Object.keys(row);
                const failColIndex = columns.indexOf('比对fail');
                if (failColIndex !== -1) {
                    const colLetter = String.fromCharCode(65 + failColIndex);
                    const cellAddr = `${colLetter}${rowIndex}`;
                    if (!ws1[cellAddr]) ws1[cellAddr] = { v: 'Y', t: 's' };
                    if (!ws1[cellAddr].s) ws1[cellAddr].s = {};
                    ws1[cellAddr].s.font = { color: { rgb: "FF0000" } };
                }
            }
        });
        
        XLSX.utils.book_append_sheet(newWorkbook, ws1, 'pad no 排序');
        
        // 2. 创建 Ball Map 工作表
        const { ws: ws2, conflicts, differences } = createBallMapSheet(processedData);
        XLSX.utils.book_append_sheet(newWorkbook, ws2, 'Ball Map');
        
        // 下载文件（使用原文件名 + _比对）
        const outputFileName = originalFileName ? `${originalFileName}_比对.xlsx` : 'PIN_Configuration_比对.xlsx';
        XLSX.writeFile(newWorkbook, outputFileName, { cellStyles: true });
        
        let message = '文件已下载！';
        if (conflicts.length > 0) {
            message += ` 注意：发现 ${conflicts.length} 个坐标冲突。`;
        }
        if (differences.length > 0) {
            message += ` 发现 ${differences.length} 个与原始 Ball Map 的差异。`;
        }
        showStatus(message, (conflicts.length > 0 || differences.length > 0) ? 'error' : 'success');
    } catch (error) {
        showStatus('下载失败: ' + error.message, 'error');
        console.error(error);
    }
}

// 显示状态消息
function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = type;
    statusDiv.style.display = 'block';
}
