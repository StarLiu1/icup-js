import React, { useState, useEffect, useRef } from 'react';

const InfoButton = ({ tooltipId, tooltipText, linkText, linkUrl, top, left, width}) => {
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const tooltipRef = useRef(null);
  const timeoutRef = useRef(null);
  
  const showTooltip = () => {
    setIsTooltipVisible(true);
    
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    // Set timeout to hide tooltip after 5 seconds
    timeoutRef.current = setTimeout(() => {
      setIsTooltipVisible(false);
    }, 3000);
  };
  
  const hideTooltip = () => {
    setIsTooltipVisible(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  };

  // Handle click outside to hide tooltip
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target)) {
        hideTooltip();
      }
    };

    if (isTooltipVisible) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isTooltipVisible]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <div style={{ position: 'relative' }} ref={tooltipRef}>
      {/* The question mark button */}
      <span 
        onMouseEnter={showTooltip}
        style={{
          backgroundColor: "#478ECC",
          color: "white",
          borderRadius: "50%",
          width: "20px",
          height: "20px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: "bold",
          fontSize: "20px",
          cursor: "pointer",
          padding: "5px"
        }}
      >
        i
      </span>
      
      {/* The tooltip */}
      <div
        style={{
          display: isTooltipVisible ? "block" : "none",
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          color: "white",
          padding: "10px",
          borderRadius: "5px",
          position: "absolute",
          zIndex: "1000",
          top: top,
          left: left,
          transform: "translateX(-50%)",
          width: width,
          textAlign: "center",
          border: "1px solid white"
        }}
      >
        <div>{tooltipText}</div>
        <a 
          href={linkUrl} 
          target="_blank" 
          rel="noopener noreferrer" 
          style={{
            color: "lightblue", 
            textDecoration: "underline"
          }}
        >
          {linkText}
        </a>
      </div>
    </div>
  );
};

export default InfoButton;