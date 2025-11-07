(function (window) {
  function measure(label) {
    const start = performance.now();
    return function () {
      const elapsed = performance.now() - start;
      console.debug(`[metrics] ${label}: ${elapsed.toFixed(2)}ms`);
      return elapsed;
    };
  }

  window.TimerMetrics = {
    measure,
  };
})(window);
