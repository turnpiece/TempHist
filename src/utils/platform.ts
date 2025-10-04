import type { PlatformInfo } from '../types/index';

/**
 * Enhanced device and platform detection
 */
export function detectDeviceAndPlatform(): PlatformInfo {
  const userAgent = navigator.userAgent;
  
  // OS Detection
  const isIOS = /iPad|iPhone|iPod/.test(userAgent);
  const isAndroid = /Android/.test(userAgent);
  const isWindows = /Windows/.test(userAgent);
  const isMac = /Mac/.test(userAgent);
  const isLinux = /Linux/.test(userAgent);
  
  // Browser Detection
  const isSafari = /Safari/.test(userAgent) && !/Chrome/.test(userAgent);
  const isChrome = /Chrome/.test(userAgent);
  const isFirefox = /Firefox/.test(userAgent);
  const isEdge = /Edg/.test(userAgent);
  
  // Device Type Detection
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
  const isTablet = /iPad|Android(?=.*\bMobile\b)(?=.*\bSafari\b)/.test(userAgent);
  const isDesktop = !isMobile && !isTablet;
  
  // Additional mobile indicators
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isSmallScreen = window.innerWidth <= 768;
  const hasMobileFeatures = 'connection' in navigator || 
                           'deviceMemory' in navigator || 
                           'hardwareConcurrency' in navigator;
  
  // Enhanced mobile detection with scoring
  const mobileScore = (isMobile ? 3 : 0) + 
                     (isTouchDevice ? 2 : 0) + 
                     (isSmallScreen ? 1 : 0) + 
                     (hasMobileFeatures ? 1 : 0);
  
  const isMobileDevice = mobileScore >= 3;
  
  // Platform-specific details
  const platform: PlatformInfo = {
    os: isIOS ? 'iOS' : isAndroid ? 'Android' : isWindows ? 'Windows' : isMac ? 'macOS' : isLinux ? 'Linux' : 'Unknown',
    browser: isSafari ? 'Safari' : isChrome ? 'Chrome' : isFirefox ? 'Firefox' : isEdge ? 'Edge' : 'Unknown',
    deviceType: isTablet ? 'Tablet' : isMobile ? 'Mobile' : 'Desktop',
    isMobile: isMobileDevice,
    isIOS,
    isAndroid,
    isSafari,
    isChrome
  };
  
  return platform;
}

/**
 * Enhanced mobile detection function (backward compatibility)
 */
export function isMobileDevice(): boolean {
  return detectDeviceAndPlatform().isMobile;
}
