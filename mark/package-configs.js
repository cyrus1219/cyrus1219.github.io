// 封装类型配置数据
const PACKAGE_CONFIGS = `TSSOP20 6.5x4.4mm,0.25,0.55,0.12
BGA64 4x4mm,0.35,0.55,0.12
BGA64 5x5mm,0.4,0.65,0.15
BGA100 7x7mm,0.4,0.6,0.15
BGA100 8x8mm,0.4,0.7,0.2
BGA201(176) 10x10mm,0.5,0.8,0.2
BGA208 13x13mm,0.7,1.2,0.3
LGA20 3x3mm,0.3,0.4,0.07
QFN24 3x3mm,0.3,0.4,0.07
QFN28 4x4mm,0.35,0.55,0.12
QFN32 4x4mm,0.35,0.55,0.12
QFN32 5x5mm,0.4,0.65,0.15
QFN36 5x5mm,0.4,0.65,0.15
QFN36 6x6mm,0.35,0.6,0.2
QFN40 5x5mm,0.4,0.65,0.15
QFN48 5x5mm,0.4,0.65,0.15
QFN48 7x7mm,0.4,0.6,0.15
QFN56 7x7mm,0.4,0.6,0.15
QFN68 7x7mm,0.4,0.6,0.15
QFN64 8x8mm,0.4,0.7,0.2
LQFP32 7x7mm,0.4,0.6,0.15
LQFP48 7x7mm,0.4,0.6,0.15
LQFP48 10x10mm,0.5,0.8,0.2
LQFP64 10x10mm,0.5,0.8,0.2
LQFP64 12x12mm,0.6,1,0.25
LQFP100 14x14mm,0.7,1.2,0.3
LQFP144 20x20mm,1,1.6,0.4
LQFP176 24x24mm,1.4,2.3,0.4
QFN64 7x7mm,0.4,0.6,0.15
LQFP128 14x14mm,0.7,1.2,0.3
BGA257 14x14mm,0.7,1.2,0.3
eLQFP64 10x10mm,0.5,0.8,0.2
QFN36 4x4mm,0.35,0.55,0.12
QFN64 9x9mm,0.5,0.8,0.2
BGA265 14x14mm,0.7,1.2,0.3
QFN20 3x3mm,0.3,0.4,0.07
FCCSP81 4x4mm,0.35,0.55,0.12
FCCSP64 3x3mm,0.3,0.4,0.07
FCCSP49 3x3mm,0.3,0.4,0.07
DFN8 2x2mm,0.25,0.4,0.1
DFN8 3x3mm,0.3,0.4,0.07
QFN16 3x3mm,0.3,0.4,0.07
QFN16 4x4mm,0.35,0.55,0.12
QFN20 3.5x3.5mm,0.3,0.4,0.07
QFN20 4x4mm,0.35,0.55,0.12
QFN20 5x5mm,0.4,0.65,0.15
QFN24 4x4mm,0.35,0.55,0.12
SOT236 2.92x1.6mm,0.25,0.4,0.1
SOT563 1.6x1.2mm,0.1525,0.27,0.08
QFN40 4x6mm,0.35,0.55,0.12
QFN14 3.5x3.5mm,0.3,0.4,0.07
FCQFN12 2.2x2.5mm,0.25,0.4,0.1
QFN88 9x9mm,0.5,0.8,0.2
FCWQFN28 4x3mm,0.3,0.4,0.1`;

function parsePackageConfigs() {
    const lines = PACKAGE_CONFIGS.trim().split('\n');
    return lines.map(line => {
        const parts = line.split(',');
        const nameAndSize = parts[0].trim();
        const match = nameAndSize.match(/^(.+?)\s+(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)mm$/);
        
        if (match) {
            return {
                name: nameAndSize,
                packageType: match[1],
                chipWidth: parseFloat(match[2]),
                chipHeight: parseFloat(match[3]),
                charWidth: parseFloat(parts[1]),
                charHeight: parseFloat(parts[2]),
                letterSpacing: parseFloat(parts[3])
            };
        }
        return null;
    }).filter(config => config !== null);
}
