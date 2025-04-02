import { transformAsync } from '@babel/core';
import { WebSocketServer } from 'ws';
import { types as t } from '@babel/core';
import fs from 'fs/promises';
import path from 'path';

const virtualModuleId = 'virtual:promise-tracker';
const resolvedVirtualModuleId = '\0' + virtualModuleId;

export default function promiseVisualizer() {
  return {
    name: 'vite-plugin-promise-vis',
    
    resolveId(id) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId;
      }
    },

    async load(id) {
      if (id === resolvedVirtualModuleId) {
        return `
          let __ws = null;
          let __messageQueue = [];
          
          function connectWS() {
            if (__ws?.readyState === 1) return;
            __ws = new WebSocket('ws://' + location.host + '/__promise_ws');
            
            __ws.onopen = () => {
              // 连接成功后发送队列中的消息
              while (__messageQueue.length > 0) {
                const data = __messageQueue.shift();
                __ws.send(data);
              }
            };
            
            __ws.onclose = () => {
              setTimeout(connectWS, 1000); // Reconnect on close
            };
          }
          connectWS();

          let __promiseId = 0;
          export const __promiseTracker = {
            track({ executor, file, line }) {
              const id = __promiseId++;
              const startTime = Date.now();
              
              const send = (status, value, error) => {
                const data = JSON.stringify({
                  id,
                  file,
                  line,
                  status,
                  value: value ? String(value) : undefined,
                  error: error ? String(error) : undefined,
                  duration: Date.now() - startTime,
                  createdAt: new Date(startTime).toISOString(),
                  updatedAt: new Date().toISOString()
                });
                
                if (__ws?.readyState === 1) {
                  __ws.send(data);
                } else {
                  __messageQueue.push(data);
                }
              };

              const promise = new Promise((resolve, reject) => {
                send('pending');
                try {
                  executor(
                    value => {
                      send('fulfilled', value);
                      resolve(value);
                    },
                    error => {
                      send('rejected', undefined, error);
                      reject(error);
                    }
                  );
                } catch (error) {
                  send('rejected', undefined, error);
                  reject(error);
                }
              });

              const originalThen = promise.then;
              promise.then = function(onFulfilled, onRejected) {
                return originalThen.call(this,
                  value => {
                    try {
                      const result = onFulfilled?.(value);
                      send('chain_fulfilled', result);
                      return result;
                    } catch(error) {
                      send('chain_rejected', undefined, error);
                      throw error;
                    }
                  },
                  error => {
                    try {
                      const result = onRejected?.(error);
                      send('chain_recovered', result);
                      return result;
                    } catch(error) {
                      send('chain_rejected', undefined, error);
                      throw error;
                    }
                  }
                );
              };

              return promise;
            }
          };
        `;
      }
    },

    configureServer(server) {
      const wss = new WebSocketServer({
        noServer: true,
        path: '/__promise_ws'
      });

      // WebSocket 服务器端事件处理
      wss.on('connection', (ws) => {
        console.log('WebSocket client connected');
        
        ws.on('message', (data) => {
          console.log('WebSocket received:', data.toString());
          // 广播消息给所有连接的客户端
          wss.clients.forEach(client => {
            if (client.readyState === 1) { // WebSocket.OPEN
              client.send(data.toString());
            }
          });
        });

        ws.on('close', () => {
          console.log('WebSocket client disconnected');
        });

        ws.on('error', (error) => {
          console.error('WebSocket error:', error);
        });
      });

      server.httpServer?.on('upgrade', (req, socket, head) => {
        if (req.url === '/__promise_ws') {
          wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req);
          });
        }
      });

      // Serve visualization panel
      server.middlewares.use('/promise-panel', async (_, res) => {
        try {
          const panelHtml = `
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="UTF-8">
                <title>Promise Visualization</title>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js"></script>
                <script>
                  // 确保 d3.js 已经加载
                  if (typeof d3 === 'undefined') {
                    console.error('D3.js not loaded');
                  }
                </script>
              </head>
              <body>
                <script type="module">
                  ${await fs.readFile(path.join(__dirname, 'assets/panel.js'), 'utf-8')}
                  const panel = createPanel();
                  
                  function connectWebSocket() {
                    const ws = new WebSocket('ws://' + location.host + '/__promise_ws');
                    
                    ws.onopen = () => {
                      console.log('Panel WebSocket connected');
                    };
                    
                    ws.onmessage = e => {
                      try {
                        const data = JSON.parse(e.data);
                        panel.onMessage(data);
                      } catch (err) {
                        console.error('Failed to parse message:', err);
                      }
                    };
                    
                    ws.onclose = () => {
                      console.log('Panel WebSocket closed, reconnecting...');
                      setTimeout(connectWebSocket, 1000);
                    };
                    
                    ws.onerror = (error) => {
                      console.error('Panel WebSocket error:', error);
                    };
                  }
                  
                  connectWebSocket();
                </script>
              </body>
            </html>
          `;
          res.setHeader('Content-Type', 'text/html');
          res.end(panelHtml);
        } catch (error) {
          console.error('Error serving panel:', error);
          res.statusCode = 500;
          res.end('Server error');
        }
      });
    },

    async transform(code, id) {
      if (!/\.[jt]sx?$/.test(id)) return null;

      try {
        console.log('Transforming file:', id);
        const result = await transformAsync(code, {
          plugins: [
            {
              visitor: {
                NewExpression(path) {
                  if (t.isIdentifier(path.node.callee, { name: 'Promise' })) {
                    const loc = path.node.loc?.start || { line: 1, column: 0 };
                    console.log('Found Promise at line:', loc.line);
                    const newExpr = t.callExpression(
                      t.memberExpression(
                        t.identifier('__promiseTracker'),
                        t.identifier('track')
                      ),
                      [
                        t.objectExpression([
                          t.objectProperty(
                            t.identifier('executor'),
                            t.cloneNode(path.node.arguments[0])
                          ),
                          t.objectProperty(
                            t.identifier('file'),
                            t.stringLiteral(id)
                          ),
                          t.objectProperty(
                            t.identifier('line'),
                            t.numericLiteral(loc.line)
                          )
                        ])
                      ]
                    );
                    path.replaceWith(newExpr);
                  }
                }
              }
            }
          ],
          filename: id
        });

        if (!result) {
          console.log('No transformation needed for:', id);
          return null;
        }

        console.log('Successfully transformed:', id);
        return {
          code: `import { __promiseTracker } from '${virtualModuleId}';\n${result.code}`,
          map: result.map
        };
      } catch (error) {
        console.error('Transform error:', error);
      }
    }
  };
}
