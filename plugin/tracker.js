let __promiseId = 0;

export const createTracker = (ws) => {
  const track = ({ executor, file, line }) => {
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
        createdAt: startTime,
        updatedAt: Date.now()
      });
      ws?.send(data);
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

    // Track promise chain
    const originalThen = promise.then;
    promise.then = function(onFulfilled, onRejected) {
      const chainedPromise = originalThen.call(this, 
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
      return chainedPromise;
    };

    return promise;
  };

  return { track };
};
