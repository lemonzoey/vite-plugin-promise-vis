const styles = `
  body { 
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto;
    background: #1e1e1e;
    color: #fff;
  }
  
  .container {
    padding: 20px;
  }
  
  .timeline {
    width: 100%;
    height: 600px;
    background: #252526;
    border-radius: 8px;
    margin-bottom: 20px;
  }
  
  .details {
    background: #252526;
    border-radius: 8px;
    padding: 16px;
  }

  .promise-item {
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 8px;
    border-radius: 4px;
  }

  .promise-item:hover {
    background: #2d2d2d;
  }

  .status {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }

  .status-pending { background: #e4a147; }
  .status-fulfilled { background: #4ec9b0; }
  .status-rejected { background: #f14c4c; }
  .status-chain_fulfilled { background: #569cd6; }
  .status-chain_rejected { background: #ce9178; }
  .status-chain_recovered { background: #9cdcfe; }

  .file {
    color: #569cd6;
  }

  .duration {
    color: #9cdcfe;
  }

  .value {
    color: #4ec9b0;
  }

  .error {
    color: #f14c4c;
  }
`;

export function createPanel() {
  const promises = new Map();
  let selectedPromise = null;

  function initializeUI() {
    document.head.innerHTML = '<style>' + styles + '</style>';
    document.body.innerHTML = `
      <div class="container">
        <div class="timeline" id="timeline"></div>
        <div class="details" id="details"></div>
      </div>
    `;

    const timeline = d3.select('#timeline');
    if (timeline.empty()) {
      console.error('Timeline container not found');
      return null;
    }

    const svg = timeline
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .style('display', 'block'); // 确保SVG可见

    // 添加初始提示文本
    svg.append('text')
      .attr('x', '50%')
      .attr('y', '50%')
      .attr('text-anchor', 'middle')
      .style('fill', '#666')
      .style('font-size', '14px')
      .text('等待 Promise 执行...');

    console.log('Panel initialized with dimensions:', {
      width: svg.node().clientWidth,
      height: svg.node().clientHeight
    });

    return { svg };
  }

  function updateTimeline(svg, data) {
    // 清除提示文本
    svg.selectAll('text').remove();
    
    const margin = { left: 120, right: 20, top: 20, bottom: 30 };
    const width = svg.node().clientWidth;
    const height = svg.node().clientHeight;
    
    const x = d3.scaleTime()
      .domain(d3.extent(data, d => new Date(d.createdAt)))
      .range([margin.left, width - margin.right]);
    
    const y = d3.scalePoint()
      .domain(data.map(d => d.id))
      .range([margin.top, height - margin.bottom])
      .padding(1);

    // Add axis
    svg.selectAll('g.x-axis').remove();
    svg.append('g')
      .attr('class', 'x-axis')
      .attr('transform', 'translate(0,' + (height - margin.bottom) + ')')
      .call(d3.axisBottom(x));

    // Add labels
    const labels = svg.selectAll('text.label')
      .data(data, d => d.id);

    labels.enter()
      .append('text')
      .attr('class', 'label')
      .merge(labels)
      .attr('x', margin.left - 8)
      .attr('y', d => y(d.id))
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'middle')
      .style('fill', '#569cd6')
      .text(d => d.file.split('/').pop());

    // Add promise status circles
    const circles = svg.selectAll('circle')
      .data(data, d => d.id + '-' + d.status);

    circles.enter()
      .append('circle')
      .merge(circles)
      .attr('cx', d => x(new Date(d.createdAt)))
      .attr('cy', d => y(d.id))
      .attr('r', 6)
      .style('fill', d => ({
        pending: '#e4a147',
        fulfilled: '#4ec9b0',
        rejected: '#f14c4c',
        chain_fulfilled: '#569cd6',
        chain_rejected: '#ce9178',
        chain_recovered: '#9cdcfe'
      }[d.status]));

    circles.exit().remove();
  }

  function updateDetails(data) {
    try {
      const details = document.getElementById('details');
      if (!details) {
        console.error('Details container not found');
        return;
      }

      console.log('Updating details with data:', data);
      
      const html = data.map(p => 
        '<div class="promise-item"' + (p.id === selectedPromise ? ' style="background:#2d2d2d"' : '') + '>' +
          '<div class="status status-' + p.status + '"></div>' +
          '<div class="file">' + p.file.split('/').pop() + ':' + p.line + '</div>' +
          '<div class="duration">' + p.duration + 'ms</div>' +
          (p.value ? '<div class="value">→ ' + p.value + '</div>' : '') +
          (p.error ? '<div class="error">→ ' + p.error + '</div>' : '') +
        '</div>'
      ).join('');
      
      details.innerHTML = html;
      console.log('Details updated');
    } catch (error) {
      console.error('Error updating details:', error);
    }
  }

  try {
    const ui = initializeUI();
    if (!ui) {
      console.error('Failed to initialize panel UI');
      return {
        onMessage: () => console.error('Panel not initialized')
      };
    }

    return {
      onMessage(data) {
        try {
          console.log('Received message:', data);
          promises.set(data.id, data);
          const promiseList = Array.from(promises.values());
          console.log('Promise list length:', promiseList.length);
          updateTimeline(ui.svg, promiseList);
          updateDetails(promiseList);
        } catch (error) {
          console.error('Error in onMessage:', error);
        }
      }
    };
  } catch (error) {
    console.error('Error creating panel:', error);
    throw error;
  };
}
