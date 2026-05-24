import React from 'react';

const Test = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-800 mb-6">
          🎯 Tailwind CSS v3 Test
        </h1>
        
        {/* Grid Test */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-md border">
            <div className="text-2xl font-bold text-blue-600">Box 1</div>
            <p className="text-gray-600 mt-2">Tailwind grid and flex</p>
          </div>
          
          <div className="bg-red-100 p-6 rounded-xl border-2 border-red-300">
            <div className="text-2xl font-bold text-red-600">Box 2</div>
            <p className="text-red-700 mt-2">Red border test</p>
          </div>
          
          <div className="bg-green-100 p-6 rounded-xl border-2 border-green-300">
            <div className="text-2xl font-bold text-green-600">Box 3</div>
            <p className="text-green-700 mt-2">Green border test</p>
          </div>
        </div>
        
        {/* Button Test */}
        <div className="space-x-4 mb-8">
          <button className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors">
            Blue Button
          </button>
          <button className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg transition-colors">
            Red Button
          </button>
          <button className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold rounded-lg transition-all">
            Gradient Button
          </button>
        </div>
        
        {/* Text Test */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Text Styles:</h2>
          <p className="text-lg text-gray-600 mb-2">Regular text</p>
          <p className="text-lg font-medium text-gray-700 mb-2">Medium weight</p>
          <p className="text-lg font-bold text-gray-800 mb-2">Bold text</p>
          <p className="text-lg italic text-gray-600">Italic text</p>
        </div>
        
        {/* Status Box */}
        <div className={`p-6 rounded-xl ${true ? 'bg-green-100 border border-green-300' : 'bg-red-100 border border-red-300'}`}>
          <h3 className="text-xl font-bold mb-2">Status:</h3>
          <p>If you see rounded corners, colors, shadows, and proper spacing, Tailwind v3 is working!</p>
        </div>
      </div>
    </div>
  );
};

export default Test;