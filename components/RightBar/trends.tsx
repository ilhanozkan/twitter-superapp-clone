import React from "react";
import { HiOutlineDotsHorizontal } from "react-icons/hi";

const Trends = () => {
  const trendsList = [
    { title: "Jungkook", popularity: "2,6M" },
    { title: "#PMShowBigBrainStuff", popularity: "10K" },
    { title: "Colorado Springs", popularity: "89.1K" },
    { title: "Jason David Frank", popularity: "24.1K" },
    { title: "LGBTQ", popularity: "119.9K" },
    { title: "Morgan Freeman", popularity: "114.6K" },
    { title: "#AskFFT", popularity: "10K" },
    { title: "#AbuDhabiGP", popularity: "285.7K" },
    { title: "RIP JDF", popularity: "10K" },
    { title: "Power Rangers", popularity: "10K" },
  ];

  return (
    <div className="w-80 rounded-xl bg-gray-50 py-2">
      <h3 className="px-4 text-[1.2rem] font-bold">Trends for you</h3>
      <ul>
        {trendsList.map((trend) => (
          <li
            key={trend.title}
            className="flex justify-between px-4 py-2 hover:cursor-pointer hover:bg-gray-100"
          >
            <div>
              <h4 className="text-base font-bold">{trend.title}</h4>
              <p className="text-sm">{trend.popularity} Tweets</p>
            </div>
            <div className="group h-fit rounded-full p-2 transition-colors duration-150 hover:bg-primary hover:bg-opacity-10">
              <HiOutlineDotsHorizontal
                size="1.2rem"
                className="fill-primary group-hover:text-primary"
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Trends;
