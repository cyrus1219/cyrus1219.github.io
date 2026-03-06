/**
 * SPC 分析工具 - UI 逻辑 & 图表渲染
 */

// 初始化图表实例
const chartRun  = echarts.init(document.getElementById('chartRun'));
const chartHist = echarts.init(document.getElementById('chartHist'));
const chartG1   = echarts.init(document.getElementById('chartG1'));
const chartG2   = echarts.init(document.getElementById('chartG2'));

// Tab 切换
document.querySelectorAll('#ctlTabNav .tab-item').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('#ctlTabNav .tab-item').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
        // 触发 resize 防止图表尺寸异常
        setTimeout(() => { chartG1.resize(); chartG2.resize(); }, 50);
    });
});

// 图表类型切换
document.getElementById('chartType').addEventListener('change', function () {
    document.getElementById('rowSubGroup').style.display = this.value === 'IMR' ? 'none' : 'flex';
});

// 实时统计样本数
document.getElementById('dataInput').addEventListener('input', function () {
    const arr = App.parseData(this.value);
    document.getElementById('sampleCount').textContent = arr.length;
});



const App = {

    // 解析输入数据
    parseData(str) {
        if (!str || !str.trim()) return [];
        return str.split(/[\s,;\t\n\r]+/)
            .map(s => parseFloat(s.trim()))
            .filter(v => !isNaN(v));
    },

    // 获取当前设置
    getSettings() {
        return {
            chartType:    document.getElementById('chartType').value,
            subGroupSize: parseInt(document.getElementById('subGroupSize').value) || 5,
            usl:          document.getElementById('uslEnabled').checked ? parseFloat(document.getElementById('usl').value) : null,
            target:       document.getElementById('targetEnabled').checked ? parseFloat(document.getElementById('target').value) : null,
            lsl:          document.getElementById('lslEnabled').checked ? parseFloat(document.getElementById('lsl').value) : null,
            digit:        parseInt(document.getElementById('digit').value) || 2,
            rules: {
                r1: document.getElementById('rule1').checked,
                r2: document.getElementById('rule2').checked,
                r3: document.getElementById('rule3').checked,
                r4: document.getElementById('rule4').checked,
                r5: document.getElementById('rule5').checked,
                r6: document.getElementById('rule6').checked,
                r7: document.getElementById('rule7').checked,
                r8: document.getElementById('rule8').checked,
            }
        };
    },

    // 清空
    clear() {
        document.getElementById('dataInput').value = '';
        document.getElementById('sampleCount').textContent = '0';
        document.getElementById('statResult').innerHTML = '<div style="color:#bbb;text-align:center;padding:20px 0;font-size:12px;">请输入数据后点击计算</div>';
        chartRun.clear(); chartHist.clear(); chartG1.clear(); chartG2.clear();
    },

    // 主计算入口
    calc() {
        const raw = document.getElementById('dataInput').value;
        const samples = this.parseData(raw);
        if (samples.length < 4) {
            alert('样本数量不足，请至少输入 4 个数据点');
            return;
        }
        document.getElementById('sampleCount').textContent = samples.length;

        const cfg = this.getSettings();
        const r = SPCCalc.calcCPK(samples, cfg.usl, cfg.lsl, cfg.chartType === 'IMR' ? 1 : cfg.subGroupSize);

        this.renderStatResult(r, cfg, samples.length);
        this.renderRunChart(samples, cfg, r);
        this.renderHistChart(samples, cfg, r);
        this.renderCtlChart(samples, cfg);
    },

    // 渲染统计结果
    renderStatResult(r, cfg, n) {
        const d = cfg.digit;
        const fmt = v => SPCCalc.round(v, d);
        const cpkClass = v => {
            if (v === '-' || v === null) return '';
            const num = parseFloat(v);
            if (num >= 1.67) return 'val-good';
            if (num >= 1.33) return 'val-good';
            if (num >= 1.0)  return 'val-warn';
            return 'val-bad';
        };
        const cpkBadge = v => {
            if (v === '-' || v === null) return '';
            const num = parseFloat(v);
            let cls = 'cpk-bad', txt = '不合格';
            if (num >= 1.67) { cls = 'cpk-good'; txt = '优秀'; }
            else if (num >= 1.33) { cls = 'cpk-good'; txt = '良好'; }
            else if (num >= 1.0)  { cls = 'cpk-warn'; txt = '勉强'; }
            return `<span class="cpk-badge ${cls}">${txt}</span>`;
        };

        const cpkVal = fmt(r.cpk);
        const ppkVal = fmt(r.ppk);

        document.getElementById('statResult').innerHTML = `
        <table class="stat-table">
            <tr>
                <td class="label-cell">总样本数</td><td>${n}</td>
                <td class="label-cell">子组大小</td><td>${cfg.chartType === 'IMR' ? 1 : cfg.subGroupSize}</td>
            </tr>
            <tr>
                <td class="label-cell">均值</td><td>${fmt(r.avg)}</td>
                <td class="label-cell">最大值</td><td>${fmt(r.max)}</td>
            </tr>
            <tr>
                <td class="label-cell">最小值</td><td>${fmt(r.min)}</td>
                <td class="label-cell">图表类型</td><td>${cfg.chartType}</td>
            </tr>
            <tr>
                <td class="label-cell">USL</td><td>${cfg.usl ?? '-'}</td>
                <td class="label-cell">LSL</td><td>${cfg.lsl ?? '-'}</td>
            </tr>
            <tr>
                <td class="label-cell">Target</td><td>${cfg.target ?? '-'}</td>
                <td class="label-cell">CA</td><td>${fmt(r.ca)}</td>
            </tr>
            <tr>
                <td class="label-cell">+3σ</td><td>${fmt(r.sigmaHigh)}</td>
                <td class="label-cell">-3σ</td><td>${fmt(r.sigmaLow)}</td>
            </tr>
        </table>
        <hr class="section-divider">
        <table class="stat-table">
            <thead><tr><th></th><th>组内(Within)</th><th>整体(Overall)</th></tr></thead>
            <tbody>
                <tr><td class="label-cell">STDEV</td><td>${fmt(r.withinSD)}</td><td>${fmt(r.normalSD)}</td></tr>
                <tr>
                    <td class="label-cell">CPK/PPK</td>
                    <td class="${cpkClass(cpkVal)}">${cpkVal} ${cpkBadge(cpkVal)}</td>
                    <td class="${cpkClass(ppkVal)}">${ppkVal} ${cpkBadge(ppkVal)}</td>
                </tr>
                <tr><td class="label-cell">CP/PP</td><td>${fmt(r.cp)}</td><td>${fmt(r.pp)}</td></tr>
                <tr><td class="label-cell">CPL/PPL</td><td>${fmt(r.cpl)}</td><td>${fmt(r.ppl)}</td></tr>
                <tr><td class="label-cell">CPU/PPU</td><td>${fmt(r.cpu)}</td><td>${fmt(r.ppu)}</td></tr>
                <tr><td class="label-cell">PPM &lt; LSL</td><td>${fmt(r.wPpml)}</td><td>${fmt(r.oPpml)}</td></tr>
                <tr><td class="label-cell">PPM &gt; USL</td><td>${fmt(r.wPpmr)}</td><td>${fmt(r.oPpmr)}</td></tr>
                <tr><td class="label-cell">PPM Total</td><td>${fmt(r.wPpmt)}</td><td>${fmt(r.oPpmt)}</td></tr>
            </tbody>
        </table>
        <hr class="section-divider">
        <table class="stat-table">
            <tr>
                <td class="label-cell">&gt; USL</td>
                <td class="${r.uslOut > 0 ? 'val-bad' : ''}">${r.uslOut} (${SPCCalc.round(r.uslOut/n*100,2)}%)</td>
                <td class="label-cell">&lt; LSL</td>
                <td class="${r.lslOut > 0 ? 'val-bad' : ''}">${r.lslOut} (${SPCCalc.round(r.lslOut/n*100,2)}%)</td>
            </tr>
        </table>`;
    },

    // 运行图
    renderRunChart(samples, cfg, r) {
        const xData = samples.map((_, i) => i + 1);
        const markLines = [];
        if (cfg.usl !== null) markLines.push({ yAxis: cfg.usl, name: 'USL', lineStyle: { color: '#e74c3c', type: 'solid', width: 1 }, label: { formatter: 'USL=' + cfg.usl, position: 'end' } });
        if (cfg.lsl !== null) markLines.push({ yAxis: cfg.lsl, name: 'LSL', lineStyle: { color: '#e74c3c', type: 'solid', width: 1 }, label: { formatter: 'LSL=' + cfg.lsl, position: 'end' } });
        if (cfg.target !== null) markLines.push({ yAxis: cfg.target, name: 'Target', lineStyle: { color: '#27ae60', type: 'dashed', width: 1 }, label: { formatter: 'T=' + cfg.target, position: 'end' } });

        const axisMax = Math.max(r.max, cfg.usl ?? -Infinity) + r.normalSD;
        const axisMin = Math.min(r.min, cfg.lsl ?? Infinity) - r.normalSD;

        chartRun.setOption({
            tooltip: { trigger: 'axis' },
            grid: { left: 50, right: 80, top: 10, bottom: 25 },
            xAxis: { type: 'category', data: xData, axisLabel: { fontSize: 10 } },
            yAxis: { type: 'value', max: SPCCalc.round(axisMax, 2), min: SPCCalc.round(axisMin, 2), splitLine: { show: false } },
            series: [{
                type: 'line',
                data: samples,
                lineStyle: { width: 0.8, color: '#1a6fc4' },
                symbolSize: v => (cfg.usl !== null && v > cfg.usl) || (cfg.lsl !== null && v < cfg.lsl) ? 7 : 4,
                itemStyle: {
                    color: p => (cfg.usl !== null && p.data > cfg.usl) || (cfg.lsl !== null && p.data < cfg.lsl) ? '#e74c3c' : '#1a6fc4'
                },
                markLine: { silent: true, symbol: 'none', data: markLines }
            }]
        }, true);
        chartRun.resize();
    },

    // 直方图 + 正态分布
    renderHistChart(samples, cfg, r) {
        const bins = Math.min(20, Math.max(8, Math.round(Math.sqrt(samples.length))));
        const histData = SPCCalc.histogram(samples, bins);

        const axisMax = Math.max(r.max, cfg.usl ?? -Infinity) + r.normalSD * 0.5;
        const axisMin = Math.min(r.min, cfg.lsl ?? Infinity) - r.normalSD * 0.5;

        const overallCurve = SPCCalc.normalCurve(r.avg, r.normalSD, axisMin, axisMax, 120);
        const withinCurve  = SPCCalc.normalCurve(r.avg, r.withinSD, axisMin, axisMax, 120);

        // 将正态曲线 Y 值缩放到直方图高度
        const maxHist = Math.max(...histData.map(d => d[1]));
        const maxCurve = Math.max(...overallCurve.map(d => d[1]));
        const scale = maxHist / maxCurve * 0.9;
        const scaledOverall = overallCurve.map(d => [d[0], SPCCalc.round(d[1] * scale, 4)]);
        const scaledWithin  = withinCurve.map(d => [d[0], SPCCalc.round(d[1] * scale, 4)]);

        const markLines = [];
        if (cfg.usl !== null) markLines.push([{ xAxis: cfg.usl }, { xAxis: cfg.usl }]);
        if (cfg.lsl !== null) markLines.push([{ xAxis: cfg.lsl }, { xAxis: cfg.lsl }]);
        if (cfg.target !== null) markLines.push([{ xAxis: cfg.target }, { xAxis: cfg.target }]);

        const avg = r.avg;
        const sd  = r.withinSD; // 用组内σ划分区域，与控制图一致
        const sigmaAreas = [
            // A区（±2σ ~ ±3σ）
            [{ xAxis: avg + 2*sd }, { xAxis: avg + 3*sd, itemStyle: { color: 'rgba(231,76,60,0.10)' }, label: { show: true, position: 'insideTop', formatter: 'A', fontSize: 10, color: '#e74c3c' } }],
            [{ xAxis: avg - 3*sd }, { xAxis: avg - 2*sd, itemStyle: { color: 'rgba(231,76,60,0.10)' }, label: { show: true, position: 'insideTop', formatter: 'A', fontSize: 10, color: '#e74c3c' } }],
            // B区（±1σ ~ ±2σ）
            [{ xAxis: avg + 1*sd }, { xAxis: avg + 2*sd, itemStyle: { color: 'rgba(243,156,18,0.10)' }, label: { show: true, position: 'insideTop', formatter: 'B', fontSize: 10, color: '#f39c12' } }],
            [{ xAxis: avg - 2*sd }, { xAxis: avg - 1*sd, itemStyle: { color: 'rgba(243,156,18,0.10)' }, label: { show: true, position: 'insideTop', formatter: 'B', fontSize: 10, color: '#f39c12' } }],
            // C区（0 ~ ±1σ）
            [{ xAxis: avg          }, { xAxis: avg + 1*sd, itemStyle: { color: 'rgba(39,174,96,0.10)'  }, label: { show: true, position: 'insideTop', formatter: 'C', fontSize: 10, color: '#27ae60' } }],
            [{ xAxis: avg - 1*sd   }, { xAxis: avg,        itemStyle: { color: 'rgba(39,174,96,0.10)'  }, label: { show: true, position: 'insideTop', formatter: 'C', fontSize: 10, color: '#27ae60' } }],
        ];

        chartHist.setOption({
            tooltip: { trigger: 'axis' },
            legend: { data: ['整体', '组内'], bottom: 0, itemHeight: 10, textStyle: { fontSize: 11 } },
            grid: { left: 40, right: 20, top: 15, bottom: 35 },
            xAxis: { type: 'value', min: SPCCalc.round(axisMin, 2), max: SPCCalc.round(axisMax, 2), splitLine: { show: false } },
            yAxis: [
                { type: 'value', splitLine: { show: false }, axisLabel: { fontSize: 10 } },
                { type: 'value', splitLine: { show: false }, axisLabel: { show: false } }
            ],
            series: [
                {
                    type: 'bar',
                    barCategoryGap: 0,
                    data: histData,
                    itemStyle: { color: '#5b9bd5', opacity: 0.75, borderColor: '#fff', borderWidth: 0.5 },
                    markArea: { silent: true, data: sigmaAreas },
                    markLine: {
                        silent: true, symbol: 'none',
                        lineStyle: { width: 1.5 },
                        data: [
                            ...(cfg.usl !== null ? [{ xAxis: cfg.usl, name: 'USL', lineStyle: { color: '#e74c3c' }, label: { formatter: 'USL' } }] : []),
                            ...(cfg.lsl !== null ? [{ xAxis: cfg.lsl, name: 'LSL', lineStyle: { color: '#e74c3c' }, label: { formatter: 'LSL' } }] : []),
                            ...(cfg.target !== null ? [{ xAxis: cfg.target, name: 'T', lineStyle: { color: '#27ae60', type: 'dashed' }, label: { formatter: 'T' } }] : []),
                        ]
                    }
                },
                {
                    name: '整体', type: 'line', yAxisIndex: 1,
                    data: scaledOverall, smooth: true, showSymbol: false,
                    lineStyle: { color: '#2c3e50', width: 1.5 }
                },
                {
                    name: '组内', type: 'line', yAxisIndex: 1,
                    data: scaledWithin, smooth: true, showSymbol: false,
                    lineStyle: { color: '#e74c3c', width: 1.5, type: 'dashed' }
                }
            ]
        }, true);
        chartHist.resize();
    },

    // 控制图
    renderCtlChart(samples, cfg) {
        const ctl = cfg.chartType === 'IMR'
            ? SPCCalc.calcIMRChart(samples)
            : SPCCalc.calcXRChart(samples, cfg.subGroupSize);

        // 更新 tab 标题
        document.querySelector('[data-tab="g1"]').textContent = ctl.g1.caption;
        document.querySelector('[data-tab="g2"]').textContent = ctl.g2.caption;

        // G1（X̄/I图）应用八大判异准则
        const { oocPoints, violations } = SPCCalc.detectOOC(
            ctl.g1.points, ctl.g1.ucl, ctl.g1.cl, ctl.g1.lcl, cfg.rules
        );
        this._renderSingleCtlChart(chartG1, ctl.g1, cfg, oocPoints, true);
        // G2（R/MR图）只用规则1
        const { oocPoints: ooc2 } = SPCCalc.detectOOC(
            ctl.g2.points, ctl.g2.ucl, ctl.g2.cl, ctl.g2.lcl, { r1:true }
        );
        this._renderSingleCtlChart(chartG2, ctl.g2, cfg, ooc2, false);

        // 渲染判异结果列表
        this._renderViolations(violations);
    },

    _renderViolations(violations) {
        const container = document.getElementById('oocResult');
        const list = document.getElementById('oocList');
        if (!violations || violations.length === 0) {
            container.style.display = 'none';
            return;
        }
        const ruleDesc = {
            1: '计算/测量错误、原材料不合格、设备故障',
            2: '过程均值发生偏移',
            3: '工具磨损、设备逐渐劣化',
            4: '两台设备或两位操作员轮流操作导致分层',
            5: '过程均值μ发生变化',
            6: '过程均值μ发生变化',
            7: '数据虚假、计算错误或分层不够',
            8: '数据分层不够',
        };
        // 去重：同一规则只显示一次（取第一次触发）
        const seen = new Set();
        const unique = violations.filter(v => {
            if (seen.has(v.rule)) return false;
            seen.add(v.rule); return true;
        });
        list.innerHTML = unique.map(v => `
            <div class="ooc-item">
                <span class="ooc-rule-tag">准则${v.rule}</span>
                <span class="ooc-desc">${v.desc}</span>
                <div class="ooc-cause">异常原因：${ruleDesc[v.rule]}</div>
            </div>`).join('');
        container.style.display = 'block';
    },

    _renderSingleCtlChart(chart, g, cfg, oocPoints, showZones) {
        const oocSet = oocPoints instanceof Set ? oocPoints : new Set(oocPoints);
        const xData = g.points.map((_, i) => i + 1);
        const sigma = (g.ucl - g.cl) / 3;

        const pointData = g.points.map((v, i) => ({
            value: v,
            itemStyle: oocSet.has(i) ? { color: '#e74c3c' } : { color: '#1a6fc4' },
            symbol: oocSet.has(i) ? 'triangle' : 'circle',
            symbolSize: oocSet.has(i) ? 8 : 5
        }));

        const allVals = [...g.points, g.ucl, g.lcl];
        const gap = (Math.max(...allVals) - Math.min(...allVals)) * 0.2 || 1;
        const yMax = SPCCalc.round(Math.max(...allVals) + gap, 3);
        const yMin = SPCCalc.round(Math.min(...allVals) - gap, 3);

        // σ 区域带（markArea）
        const markAreas = showZones ? [
            // A区上（+2σ ~ +3σ）
            [{ yAxis: g.cl + 2*sigma }, { yAxis: g.cl + 3*sigma, itemStyle: { color: 'rgba(231,76,60,0.08)' }, label: { show: true, position: 'insideTopRight', formatter: 'A', fontSize: 10, color: '#e74c3c' } }],
            // B区上（+1σ ~ +2σ）
            [{ yAxis: g.cl + 1*sigma }, { yAxis: g.cl + 2*sigma, itemStyle: { color: 'rgba(243,156,18,0.08)' }, label: { show: true, position: 'insideTopRight', formatter: 'B', fontSize: 10, color: '#f39c12' } }],
            // C区上（0 ~ +1σ）
            [{ yAxis: g.cl }, { yAxis: g.cl + 1*sigma, itemStyle: { color: 'rgba(39,174,96,0.08)' }, label: { show: true, position: 'insideTopRight', formatter: 'C', fontSize: 10, color: '#27ae60' } }],
            // C区下（-1σ ~ 0）
            [{ yAxis: g.cl - 1*sigma }, { yAxis: g.cl, itemStyle: { color: 'rgba(39,174,96,0.08)' }, label: { show: true, position: 'insideBottomRight', formatter: 'C', fontSize: 10, color: '#27ae60' } }],
            // B区下（-2σ ~ -1σ）
            [{ yAxis: g.cl - 2*sigma }, { yAxis: g.cl - 1*sigma, itemStyle: { color: 'rgba(243,156,18,0.08)' }, label: { show: true, position: 'insideBottomRight', formatter: 'B', fontSize: 10, color: '#f39c12' } }],
            // A区下（-3σ ~ -2σ）
            [{ yAxis: g.cl - 3*sigma }, { yAxis: g.cl - 2*sigma, itemStyle: { color: 'rgba(231,76,60,0.08)' }, label: { show: true, position: 'insideBottomRight', formatter: 'A', fontSize: 10, color: '#e74c3c' } }],
        ] : [];

        chart.setOption({
            tooltip: {
                trigger: 'axis',
                formatter: p => {
                    const i = p[0].dataIndex;
                    const v = g.points[i];
                    const s = (g.ucl - g.cl) / 3;
                    const d = Math.abs(v - g.cl) / s;
                    const zoneName = d > 3 ? '超出' : d > 2 ? 'A区' : d > 1 ? 'B区' : 'C区';
                    const side = v >= g.cl ? '上' : '下';
                    return `#${i+1}: ${SPCCalc.round(v, cfg.digit)}　${side}${zoneName}${oocSet.has(i) ? '　⚠ 异常' : ''}`;
                }
            },
            grid: { left: 55, right: 20, top: 15, bottom: 25 },
            xAxis: { type: 'category', data: xData, axisLabel: { fontSize: 10 } },
            yAxis: { type: 'value', max: yMax, min: yMin, splitLine: { show: false }, axisLabel: { fontSize: 10 } },
            series: [{
                type: 'line',
                data: pointData,
                lineStyle: { width: 0.8, color: '#1a6fc4' },
                markArea: { silent: true, data: markAreas },
                markLine: {
                    silent: true, symbol: 'none',
                    data: [
                        { yAxis: g.ucl, lineStyle: { color: '#e74c3c', width: 1 }, label: { formatter: `UCL=${SPCCalc.round(g.ucl, cfg.digit)}`, position: 'insideEndTop', fontSize: 10 } },
                        { yAxis: g.cl,  lineStyle: { color: '#27ae60', width: 1, type: 'dashed' }, label: { formatter: `CL=${SPCCalc.round(g.cl, cfg.digit)}`, position: 'insideEndTop', fontSize: 10 } },
                        { yAxis: g.lcl, lineStyle: { color: '#e74c3c', width: 1 }, label: { formatter: `LCL=${SPCCalc.round(g.lcl, cfg.digit)}`, position: 'insideEndBottom', fontSize: 10 } },
                        // σ 辅助线
                        { yAxis: g.cl + sigma,   lineStyle: { color: '#f39c12', width: 0.5, type: 'dashed', opacity: 0.6 }, label: { show: false } },
                        { yAxis: g.cl + 2*sigma, lineStyle: { color: '#e67e22', width: 0.5, type: 'dashed', opacity: 0.6 }, label: { show: false } },
                        { yAxis: g.cl - sigma,   lineStyle: { color: '#f39c12', width: 0.5, type: 'dashed', opacity: 0.6 }, label: { show: false } },
                        { yAxis: g.cl - 2*sigma, lineStyle: { color: '#e67e22', width: 0.5, type: 'dashed', opacity: 0.6 }, label: { show: false } },
                    ]
                }
            }]
        }, true);
        chart.resize();
    }
};

// 窗口 resize 时重绘所有图表
window.addEventListener('resize', () => {
    chartRun.resize(); chartHist.resize(); chartG1.resize(); chartG2.resize();
});
