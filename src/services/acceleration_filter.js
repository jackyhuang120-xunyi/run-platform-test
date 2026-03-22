// 加速度均值滤波函数
export const smoothAcceleration = (accData, windowSize = 31) => {
  const smoothed = [];
  const halfWindow = Math.floor(windowSize / 2);

  for (let i = 0; i < accData.length; i++) {
    let sum = 0;
    let count = 0;

    for (let j = -halfWindow; j <= halfWindow; j++) {
      const idx = i + j;
      if (idx >= 0 && idx < accData.length) {
        sum += accData[idx];
        count++;
      }
    }

    smoothed[i] = sum / count;
  }

  return smoothed;
};
