(function() {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var accent3 = style.getPropertyValue('--accent3').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();
  var danger = style.getPropertyValue('--danger').trim();

  // --- Chart 1: Feature Completeness by Category ---
  var chart1 = echarts.init(document.getElementById('chart-completeness'), null, { renderer: 'svg' });
  chart1.setOption({
    animation: false,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      appendToBody: true,
      formatter: function(params) {
        var p = params[0];
        return p.name + '<br/>完成度: <b>' + p.value + '%</b>';
      }
    },
    grid: { left: 100, right: 40, top: 20, bottom: 30 },
    xAxis: {
      type: 'value',
      max: 100,
      axisLabel: { color: muted, fontSize: 11, formatter: '{value}%' },
      splitLine: { lineStyle: { color: rule, type: 'dashed' } },
      axisLine: { lineStyle: { color: rule } }
    },
    yAxis: {
      type: 'category',
      data: ['AI 集成', '任务管理', '日历视图', '效率工具', '系统功能', '数据统计', '提醒功能', '协作同步', '主题外观'],
      axisLabel: { color: ink, fontSize: 12 },
      axisLine: { lineStyle: { color: rule } },
      axisTick: { show: false }
    },
    series: [{
      type: 'bar',
      data: [
        { value: 95, itemStyle: { color: accent3 } },
        { value: 65, itemStyle: { color: accent } },
        { value: 60, itemStyle: { color: accent } },
        { value: 55, itemStyle: { color: accent } },
        { value: 50, itemStyle: { color: accent2 } },
        { value: 50, itemStyle: { color: accent2 } },
        { value: 35, itemStyle: { color: accent2 } },
        { value: 0, itemStyle: { color: danger } },
        { value: 25, itemStyle: { color: danger } }
      ],
      barWidth: '50%',
      label: {
        show: true,
        position: 'right',
        formatter: '{c}%',
        color: ink,
        fontSize: 11,
        fontWeight: 600
      }
    }]
  });
  window.addEventListener('resize', function() { chart1.resize(); });

  // --- Chart 2: Roadmap Priority & Effort ---
  var chart2 = echarts.init(document.getElementById('chart-roadmap'), null, { renderer: 'svg' });
  chart2.setOption({
    animation: false,
    tooltip: {
      trigger: 'item',
      appendToBody: true,
      formatter: function(params) {
        return params.name + '<br/>工作量: <b>' + params.value[0] + ' 天</b><br/>优先级: <b>' + ['P0','P1','P2','P3'][params.value[1]] + '</b>';
      }
    },
    grid: { left: 60, right: 40, top: 30, bottom: 50 },
    xAxis: {
      type: 'value',
      name: '工作量（天）',
      nameLocation: 'middle',
      nameGap: 35,
      nameTextStyle: { color: muted, fontSize: 11 },
      axisLabel: { color: muted, fontSize: 11 },
      splitLine: { lineStyle: { color: rule, type: 'dashed' } },
      axisLine: { lineStyle: { color: rule } }
    },
    yAxis: {
      type: 'value',
      min: -0.5,
      max: 3.5,
      inverse: true,
      name: '优先级',
      nameLocation: 'middle',
      nameGap: 40,
      nameTextStyle: { color: muted, fontSize: 11 },
      axisLabel: {
        color: ink,
        fontSize: 11,
        formatter: function(val) {
          return ['P0','P1','P2','P3'][val] || '';
        }
      },
      splitLine: { show: false },
      axisLine: { lineStyle: { color: rule } }
    },
    series: [{
      type: 'scatter',
      symbolSize: function(data) {
        return 18 + data[0] * 2.5;
      },
      data: [
        // [工作量(天), 优先级(0-3), 名称]
        [3, 0, '子任务独立操作'],
        [2, 0, '回收站/撤销删除'],
        [4, 0, '提醒声音与多提醒'],
        [3, 1, 'Markdown 备注'],
        [2, 1, '数据导入'],
        [4, 2, '倒数纪念日'],
        [5, 2, '自定义重复规则'],
        [3, 2, '过滤器/智能清单'],
        [3, 2, '看板自定义列'],
        [5, 2, '时间线视图'],
        [2, 2, '全局快捷键'],
        [4, 2, '深色模式适配'],
        [6, 3, '年视图/日程视图'],
        [3, 3, '习惯月历热力图'],
        [3, 3, '番茄钟白噪音'],
        [4, 3, '多主题与清单背景'],
        [2, 3, '二级标签'],
        [4, 3, '附件支持'],
        [2, 3, '语音输入']
      ],
      itemStyle: {
        color: function(params) {
          var colors = [danger, accent, accent2, accent3];
          return colors[params.value[1]] || accent;
        },
        opacity: 0.75
      },
      label: {
        show: true,
        position: 'right',
        formatter: function(params) {
          return params.value[2];
        },
        color: ink,
        fontSize: 10
      }
    }]
  });
  window.addEventListener('resize', function() { chart2.resize(); });
})();
