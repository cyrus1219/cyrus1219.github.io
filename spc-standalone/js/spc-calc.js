/**
 * SPC 核心计算模块
 * 包含：CPK/PPK/CP/PP/正态分布/控制图控制限 等统计计算
 */

const SPCCalc = {

    // 均值
    mean(arr) {
        if (!arr || arr.length === 0) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    },

    // 总体标准差（NormalSD / Overall SD）
    stdDev(arr) {
        if (!arr || arr.length < 2) return 0;
        const m = this.mean(arr);
        const variance = arr.reduce((s, v) => s + Math.pow(v - m, 2), 0) / (arr.length - 1);
        return Math.sqrt(variance);
    },

    // 组内标准差（WithinSD）基于 Rbar/d2 方法
    withinStdDev(arr, subGroupSize) {
        if (!arr || arr.length < subGroupSize || subGroupSize < 2) return this.stdDev(arr);
        // d2 常数表
        const d2Table = { 2: 1.128, 3: 1.693, 4: 2.059, 5: 2.326, 6: 2.534, 7: 2.704, 8: 2.847, 9: 2.970, 10: 3.078 };
        const d2 = d2Table[subGroupSize] || 1.693;
        const groups = this._splitGroups(arr, subGroupSize);
        const ranges = groups.map(g => Math.max(...g) - Math.min(...g));
        const rBar = this.mean(ranges);
        return rBar / d2;
    },

    // 分组
    _splitGroups(arr, size) {
        const groups = [];
        for (let i = 0; i + size <= arr.length; i += size) {
            groups.push(arr.slice(i, i + size));
        }
        return groups;
    },

    // CPK 计算
    calcCPK(arr, usl, lsl, subGroupSize) {
        const n = arr.length;
        if (n < 2) return null;

        const avg = this.mean(arr);
        const normalSD = this.stdDev(arr);
        const withinSD = this.withinStdDev(arr, subGroupSize || 5);

        const hasUSL = usl !== null && usl !== undefined && !isNaN(usl);
        const hasLSL = lsl !== null && lsl !== undefined && !isNaN(lsl);

        // 组内（Within）
        const cpu  = hasUSL ? (usl - avg) / (3 * withinSD) : null;
        const cpl  = hasLSL ? (avg - lsl) / (3 * withinSD) : null;
        const cpk  = (cpu !== null && cpl !== null) ? Math.min(cpu, cpl) : (cpu ?? cpl);
        const cp   = (hasUSL && hasLSL) ? (usl - lsl) / (6 * withinSD) : null;

        // 整体（Overall）
        const ppu  = hasUSL ? (usl - avg) / (3 * normalSD) : null;
        const ppl  = hasLSL ? (avg - lsl) / (3 * normalSD) : null;
        const ppk  = (ppu !== null && ppl !== null) ? Math.min(ppu, ppl) : (ppu ?? ppl);
        const pp   = (hasUSL && hasLSL) ? (usl - lsl) / (6 * normalSD) : null;

        // CA
        const ca = (hasUSL && hasLSL) ? (avg - (usl + lsl) / 2) / ((usl - lsl) / 2) : null;

        // PPM
        const wPpml = hasLSL ? this.normPPM((lsl - avg) / withinSD) : 0;
        const wPpmr = hasUSL ? this.normPPM((avg - usl) / withinSD) : 0;
        const oPpml = hasLSL ? this.normPPM((lsl - avg) / normalSD) : 0;
        const oPpmr = hasUSL ? this.normPPM((avg - usl) / normalSD) : 0;

        // 实测超规格
        const fPpml = hasLSL ? arr.filter(v => v < lsl).length / n * 1e6 : 0;
        const fPpmr = hasUSL ? arr.filter(v => v > usl).length / n * 1e6 : 0;

        // Sigma 控制线（±3σ 基于组内）
        const sigmaHigh = avg + 3 * withinSD;
        const sigmaLow  = avg - 3 * withinSD;

        return {
            n, avg,
            max: Math.max(...arr),
            min: Math.min(...arr),
            normalSD, withinSD,
            cpk, ppk, cp, pp, cpu, cpl, ppu, ppl, ca,
            wPpml, wPpmr, wPpmt: wPpml + wPpmr,
            oPpml, oPpmr, oPpmt: oPpml + oPpmr,
            fPpml, fPpmr, fPpmt: fPpml + fPpmr,
            sigmaHigh, sigmaLow,
            lslOut: hasLSL ? arr.filter(v => v < lsl).length : 0,
            uslOut: hasUSL ? arr.filter(v => v > usl).length : 0,
        };
    },

    // 正态分布 CDF（近似）
    normCDF(z) {
        const t = 1 / (1 + 0.2316419 * Math.abs(z));
        const d = 0.3989423 * Math.exp(-z * z / 2);
        const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))));
        return z > 0 ? 1 - p : p;
    },

    // PPM（百万分之不合格数）
    normPPM(z) {
        return this.normCDF(z) * 1e6;
    },

    // 正态分布 PDF
    normPDF(x, mean, sd) {
        return Math.exp(-0.5 * Math.pow((x - mean) / sd, 2)) / (sd * Math.sqrt(2 * Math.PI));
    },

    // 生成正态分布曲线点
    normalCurve(mean, sd, min, max, points = 100) {
        const step = (max - min) / points;
        const result = [];
        for (let x = min; x <= max; x += step) {
            result.push([parseFloat(x.toFixed(4)), parseFloat(this.normPDF(x, mean, sd).toFixed(6))]);
        }
        return result;
    },

    // 直方图分组
    histogram(arr, bins = 10) {
        const min = Math.min(...arr);
        const max = Math.max(...arr);
        const step = (max - min) / bins;
        const result = [];
        for (let i = 0; i < bins; i++) {
            const lo = min + i * step;
            const hi = lo + step;
            const count = arr.filter(v => v >= lo && (i === bins - 1 ? v <= hi : v < hi)).length;
            result.push([parseFloat((lo + step / 2).toFixed(4)), count]);
        }
        return result;
    },

    // XR 控制图控制限
    calcXRChart(arr, subGroupSize) {
        const size = subGroupSize || 5;
        // 控制图常数
        const A2 = { 2:1.880,3:1.023,4:0.729,5:0.577,6:0.483,7:0.419,8:0.373,9:0.337,10:0.308 };
        const D3 = { 2:0,3:0,4:0,5:0,6:0,7:0.076,8:0.136,9:0.184,10:0.223 };
        const D4 = { 2:3.267,3:2.574,4:2.282,5:2.114,6:2.004,7:1.924,8:1.864,9:1.816,10:1.777 };

        const a2 = A2[size] || 0.577;
        const d3 = D3[size] || 0;
        const d4 = D4[size] || 2.114;

        const groups = this._splitGroups(arr, size);
        const xBars = groups.map(g => this.mean(g));
        const ranges = groups.map(g => Math.max(...g) - Math.min(...g));

        const xBarBar = this.mean(xBars);
        const rBar = this.mean(ranges);

        return {
            // X-bar 图
            g1: {
                caption: `X̄ 图 (n=${size})`,
                points: xBars,
                cl: xBarBar,
                ucl: xBarBar + a2 * rBar,
                lcl: xBarBar - a2 * rBar,
            },
            // R 图
            g2: {
                caption: `R 图 (n=${size})`,
                points: ranges,
                cl: rBar,
                ucl: d4 * rBar,
                lcl: d3 * rBar,
            }
        };
    },

    // IMR 控制图（单值）
    calcIMRChart(arr) {
        const mr = [];
        for (let i = 1; i < arr.length; i++) {
            mr.push(Math.abs(arr[i] - arr[i - 1]));
        }
        const xBar = this.mean(arr);
        const mrBar = this.mean(mr);
        const d2 = 1.128;
        const D4 = 3.267;

        return {
            g1: {
                caption: 'I 图（单值）',
                points: arr,
                cl: xBar,
                ucl: xBar + 3 * mrBar / d2,
                lcl: xBar - 3 * mrBar / d2,
            },
            g2: {
                caption: 'MR 图（移动极差）',
                points: mr,
                cl: mrBar,
                ucl: D4 * mrBar,
                lcl: 0,
            }
        };
    },

    /**
     * 八大判异准则检测
     * @param {number[]} points - 控制图数据点
     * @param {number} ucl - 控制上限 (+3σ)
     * @param {number} cl  - 中心线
     * @param {number} lcl - 控制下限 (-3σ)
     * @param {object} enabledRules - { r1:true, r2:true, ... } 各规则是否启用
     * @returns {{ oocPoints: Set<number>, violations: Array<{rule,indices,desc}> }}
     */
    detectOOC(points, ucl, cl, lcl, enabledRules = {}) {
        const rules = Object.assign(
            { r1:true, r2:true, r3:true, r4:true, r5:true, r6:true, r7:true, r8:true },
            enabledRules
        );
        const n = points.length;
        const sigma = (ucl - cl) / 3; // 1σ 宽度

        // 区域判断：返回点相对中心线的区域 1=C区(0~1σ), 2=B区(1~2σ), 3=A区(2~3σ), 4=超出(>3σ)
        // 正数=中心线上方，负数=中心线下方
        const zone = v => {
            const d = (v - cl) / sigma;
            const abs = Math.abs(d);
            const sign = d >= 0 ? 1 : -1;
            if (abs > 3) return sign * 4;
            if (abs > 2) return sign * 3;
            if (abs > 1) return sign * 2;
            return sign * 1;
        };

        const zones = points.map(zone);
        const oocPoints = new Set();
        const violations = [];

        const mark = (indices, rule, desc) => {
            indices.forEach(i => oocPoints.add(i));
            violations.push({ rule, indices: [...indices], desc });
        };

        // 规则1：一个点落在A区以外（超出±3σ）
        if (rules.r1) {
            points.forEach((v, i) => {
                if (v > ucl || v < lcl) mark([i], 1, `点#${i+1} 超出控制限`);
            });
        }

        // 规则2：连续9个点落在中心线同一侧
        if (rules.r2) {
            for (let i = 8; i < n; i++) {
                const seg = zones.slice(i - 8, i + 1);
                if (seg.every(z => z > 0) || seg.every(z => z < 0)) {
                    mark(Array.from({length:9}, (_,j) => i-8+j), 2, `点#${i-7}~#${i+1} 连续9点在中心线同侧`);
                }
            }
        }

        // 规则3：连续6个点递增或递减
        if (rules.r3) {
            for (let i = 5; i < n; i++) {
                const seg = points.slice(i - 5, i + 1);
                let up = true, down = true;
                for (let j = 1; j < seg.length; j++) {
                    if (seg[j] <= seg[j-1]) up = false;
                    if (seg[j] >= seg[j-1]) down = false;
                }
                if (up || down) mark(Array.from({length:6}, (_,j) => i-5+j), 3, `点#${i-4}~#${i+1} 连续6点${up?'递增':'递减'}`);
            }
        }

        // 规则4：连续14个点交替上下
        if (rules.r4) {
            for (let i = 13; i < n; i++) {
                const seg = points.slice(i - 13, i + 1);
                let alt = true;
                for (let j = 1; j < seg.length; j++) {
                    const up = seg[j] > seg[j-1];
                    const prevUp = seg[j-1] > seg[j-2];
                    if (j >= 2 && up === prevUp) { alt = false; break; }
                }
                if (alt) mark(Array.from({length:14}, (_,j) => i-13+j), 4, `点#${i-12}~#${i+1} 连续14点交替上下`);
            }
        }

        // 规则5：连续3个点中有2个点在中心线同侧B区以外（|zone|>=2，同号）
        if (rules.r5) {
            for (let i = 2; i < n; i++) {
                const seg = zones.slice(i - 2, i + 1);
                const aboveB = seg.filter(z => z >= 2);
                const belowB = seg.filter(z => z <= -2);
                if (aboveB.length >= 2 || belowB.length >= 2) {
                    mark(Array.from({length:3}, (_,j) => i-2+j), 5, `点#${i-1}~#${i+1} 连续3点中2点在B区外同侧`);
                }
            }
        }

        // 规则6：连续5个点中有4个点在中心线同侧C区以外（|zone|>=1，同号）
        if (rules.r6) {
            for (let i = 4; i < n; i++) {
                const seg = zones.slice(i - 4, i + 1);
                const aboveC = seg.filter(z => z >= 1).length; // 上方（含C区及以外）
                const belowC = seg.filter(z => z <= -1).length;
                // C区以外 = |zone|>=2
                const aboveOut = seg.filter(z => z >= 2).length;
                const belowOut = seg.filter(z => z <= -2).length;
                if (aboveOut >= 4 || belowOut >= 4) {
                    mark(Array.from({length:5}, (_,j) => i-4+j), 6, `点#${i-3}~#${i+1} 连续5点中4点在C区外同侧`);
                }
            }
        }

        // 规则7：连续15个点落在中心线两侧C区以内（|zone|===1，即±1σ内）
        if (rules.r7) {
            for (let i = 14; i < n; i++) {
                const seg = zones.slice(i - 14, i + 1);
                if (seg.every(z => Math.abs(z) === 1)) {
                    mark(Array.from({length:15}, (_,j) => i-14+j), 7, `点#${i-13}~#${i+1} 连续15点在C区内`);
                }
            }
        }

        // 规则8：连续8个点在中心线两侧且无一在C区内（|zone|>=2）
        if (rules.r8) {
            for (let i = 7; i < n; i++) {
                const seg = zones.slice(i - 7, i + 1);
                const bothSides = seg.some(z => z > 0) && seg.some(z => z < 0);
                const noneInC = seg.every(z => Math.abs(z) >= 2);
                if (bothSides && noneInC) {
                    mark(Array.from({length:8}, (_,j) => i-7+j), 8, `点#${i-6}~#${i+1} 连续8点两侧且无一在C区`);
                }
            }
        }

        return { oocPoints, violations };
    },

    round(v, n = 2) {
        if (v === null || v === undefined || isNaN(v)) return '-';
        return parseFloat(v.toFixed(n));
    }
};
