// Dots icon
import { HiOutlineDotsHorizontal } from "react-icons/hi";

const UserButton = () => {
  return (
    <button className="mb-3 flex items-center justify-between rounded-full p-3 text-sm transition-colors duration-200 hover:bg-gray-200">
      <div className="flex">
        <img
          src="https://pbs.twimg.com/profile_images/1585737676489166850/QJYayPIS_normal.jpg"
          className="w-10 rounded-full"
        />
        <div className="ml-3 text-start">
          <p>
            <strong>ilhan</strong>
          </p>
          <p className="text-gray-500">@illhanozkan</p>
        </div>
      </div>
      <HiOutlineDotsHorizontal size="1.2rem" />
    </button>
  );
};

export default UserButton;
