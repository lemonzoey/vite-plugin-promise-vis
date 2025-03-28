import { transformAsync } from '@babel/core';
import { WebSocketServer } from 'ws';
import { types as t } from '@babel/core';

const virtualModuleId = 'virtual:promise-tracker';
const resolvedVirtualModuleId = '\0' + virtualModuleId;

export default function promiseVisualizer() {
  return {
    name: 'vite-plugin-promise-vis',
    resolveId(id) {
      return id === virtualModuleId ? resolvedVirtualModuleId : null;
    },
    load(id) {
      if (id === resolvedVirtualModuleId) {
        return `
          let __promiseId = 0;
          export const __promiseTracker = {
            track({ executor, file, line }) {
              const id = __promiseId++;
              const send = (status, value) => {
                const data = JSON.stringify({
                  id,
                  file,
                  line,
                  status,
                  value: String(value),
                  createdAt: Date.now()
                });
                window.__PROMISE_WS__?.send(data);
              };
              
              return new Promise((resolve, reject) => {
                send('pending');
                try {
                  executor(
                    value => { send('fulfilled', value); resolve(value); },
                    error => { send('rejected', error); reject(error); }
                  );
                } catch (error) {
                  send('rejected', error);
                  reject(error);
                }
              });
            }
          };
        `;
      }
    },
    configureServer(server) {
      const wss = new WebSocketServer({
        noServer: true,
        path: '/__promise_ws',
      });

      server.httpServer?.on('upgrade', (req, socket, head) => {
        if (req.url === '/__promise_ws') {
          wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req);
          });
        }
      });

      server.middlewares.use('/promise-panel', (_, res) => {
        res.end(`
          <!DOCTYPE html>
          <html>
            <body>
              <div id="timeline" style="width:100%;height:600px"></div>
              <script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js"></script>
              <script>
                const ws = new WebSocket('ws://' + location.host + '/__promise_ws');
                window.__PROMISE_WS__ = ws;
                
                const svg = d3.select('#timeline')
                  .append('svg')
                  .attr('width', '100%')
                  .attr('height', '100%');
                
                let promises = [];
                
                ws.onmessage = e => {
                  const data = JSON.parse(e.data);
                  promises = [...promises, data].slice(-50); // 保留最近50条
                  
                  const margin = { left: 100, right: 20, top: 20, bottom: 30 };
                  const width = svg.node().clientWidth;
                  const height = svg.node().clientHeight;
                  
                  const x = d3.scaleTime()
                    .domain(d3.extent(promises, d => d.createdAt))
                    .range([margin.left, width - margin.right]);
                  
                  const y = d3.scalePoint()
                    .domain(promises.map((_,i) => i))
                    .range([margin.top, height - margin.bottom]);
                    
                  svg.selectAll('circle').data(promises)
                    .join('circle')
                    .attr('cx', d => x(d.createdAt))
                    .attr('cy', (_,i) => y(i))
                    .attr('r', 8)
                    .attr('fill', d => ({
                      pending: 'orange',
                      fulfilled: 'green',
                      rejected: 'red'
                    }[d.status]));
                };
              </script>
            </body>
          </html>
        `);
      });
    },
    async transform(code, id) {
      if (!/\.[jt]sx?$/.test(id)) return;

      try {
        const result = await transformAsync(code, {
          plugins: [
            {
              visitor: {
                NewExpression(path) {
                  if (t.isIdentifier(path.node.callee, { name: 'Promise' })) {
                    const loc = path.node.loc?.start || { line: 1, column: 0 };
                    const newExpr = t.callExpression(
                      t.memberExpression(
                        t.identifier('__promiseTracker'),
                        t.identifier('track'),
                      ),
                      [
                        t.objectExpression([
                          t.objectProperty(
                            t.identifier('executor'),
                            t.cloneNode(path.node.arguments[0]),
                          ),
                          t.objectProperty(
                            t.identifier('file'),
                            t.stringLiteral(id),
                          ),
                          t.objectProperty(
                            t.identifier('line'),
                            t.numericLiteral(loc.line),
                          ),
                        ]),
                      ],
                    );
                    path.replaceWith(newExpr);
                  }
                },
              },
            },
          ],
        });

        return (
          result && {
            code: `import { __promiseTracker } from '${virtualModuleId}';\n${result.code}`,
            map: result.map,
          }
        );
      } catch (e) {
        console.error('Transform error:', e);
      }
    },
  };
}
