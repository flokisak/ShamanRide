
import React, { useState, useEffect } from 'react';

interface CountdownProps {
  freeAt: number;
}

export const Countdown: React.FC<CountdownProps> = ({ freeAt }) => {
  const calculateRemainingTime = () => {
    const now = Date.now();
    const remaining = Math.max(0, freeAt - now);
    return Math.floor(remaining / 1000); // remaining seconds
  };

  const [remainingSeconds, setRemainingSeconds] = useState(calculateRemainingTime);

  useEffect(() => {
    const interval = setInterval(() => {
      setRemainingSeconds(calculateRemainingTime());
    }, 1000);

    return () => clearInterval(interval);
  }, [freeAt]);

  if (remainingSeconds <= 0) {
    return null;
  }
  
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  return (
    <span className="ml-2 font-mono text-xs tracking-wider">
      ({minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')})
    </span>
  );
};