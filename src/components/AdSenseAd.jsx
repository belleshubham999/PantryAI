import React, { useEffect } from 'react';

const AdSenseAd = ({ adSlot, adFormat = 'auto', adStyle = { display: 'block' } }) => {
  useEffect(() => {
    // Load AdSense script
    const script = document.createElement('script');
    script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';
    script.async = true;
    script.crossOrigin = 'anonymous';
    document.head.appendChild(script);

    // Initialize ad
    if (window.adsbygoogle) {
      window.adsbygoogle.push({});
    }
  }, []);

  return (
    <div className="ad-container my-4">
      <ins 
        className="adsbygoogle"
        style={adStyle}
        data-ad-client="ca-pub-YOUR_PUBLISHER_ID"  // You'll get this from AdSense
        data-ad-slot={adSlot}
        data-ad-format={adFormat}
        data-full-width-responsive="true"
      ></ins>
    </div>
  );
};

export default AdSenseAd;