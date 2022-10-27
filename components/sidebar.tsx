import Link from "next/link";

import TwitterLogo from "./twitterLogo";
import Navigation from "./navigation";
import TweetButton from "./tweetButton";
import MoreButton from "./moreButton";
import UserButton from "./userButton";

const Sidebar = () => {
  return (
    <div className="flex h-screen w-72 flex-col justify-between border-r border-gray-100 px-4">
      <div>
        <div className="max-w-fit cursor-pointer rounded-full p-3 transition-colors duration-200 hover:bg-primary/10">
          <Link href="/">
            <TwitterLogo />
          </Link>
        </div>
        <Navigation />
        <MoreButton />
        <TweetButton />
      </div>

      <UserButton />
    </div>
  );
};

export default Sidebar;
