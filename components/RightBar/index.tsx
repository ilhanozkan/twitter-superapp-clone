import React from "react";

import Trends from "./trends";

const RightBar = () => {
  return (
    <div className="sticky top-0 ml-8 h-screen">
      <input
        type="text"
        placeholder="🔍 Search Twitter"
        className="mb-4 w-80 rounded-full bg-gray-50 py-3 px-6 focus:outline-primary"
      />
      <Trends />
    </div>
  );
};

export default RightBar;
