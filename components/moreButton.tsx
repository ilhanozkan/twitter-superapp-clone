// Dots icon
import { HiOutlineDotsCircleHorizontal } from "react-icons/hi";

const MoreButton = () => {
  return (
    <button
      className={`group mt-1.5 flex w-fit cursor-pointer items-center rounded-full py-2.5 pl-3 pr-7 transition-colors duration-200 hover:bg-gray-200`}
    >
      <HiOutlineDotsCircleHorizontal size="1.8rem" />
      <p className="ml-4 text-lg">More</p>
    </button>
  );
};

export default MoreButton;
