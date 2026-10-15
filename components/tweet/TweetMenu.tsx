import { useRouter } from "next/router";
import { useState } from "react";
import { HiEllipsisHorizontal, HiOutlineTrash } from "react-icons/hi2";

import { errorMessage } from "../../lib/client/api";
import { deleteTweet } from "../../slices/tweetsSlice";
import { showToast } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { ITweet } from "../../types/Tweet";
import { Button } from "../common/Button";
import Dialog from "../common/Dialog";
import Menu from "../common/Menu";
import { statusPath } from "./paths";

/** The "…" menu on the current user's own tweets. */
export default function TweetMenu({ tweet }: { tweet: ITweet }) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const viewer = useAppSelector((state) => state.session.viewer);
  const readOnly = useAppSelector((state) => state.session.readOnly);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMine =
    !!viewer &&
    viewer.username.toLowerCase() === tweet.author.username.toLowerCase();
  if (!isMine || readOnly) return null;

  const confirmDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await dispatch(deleteTweet(tweet.id)).unwrap();
      setConfirming(false);
      dispatch(showToast({ message: "Your Tweet was deleted" }));
      // Leave the tweet's own page once it no longer exists.
      if (router.asPath.split(/[?#]/)[0] === statusPath(tweet))
        router.replace("/");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Menu
        label="More options"
        trigger={<HiEllipsisHorizontal aria-hidden="true" />}
        triggerClassName="-m-2 rounded-full p-2 text-lg text-muted transition-colors hover:bg-primary/10 hover:text-primary"
        items={[
          {
            label: "Delete",
            icon: <HiOutlineTrash />,
            danger: true,
            onSelect: () => setConfirming(true),
          },
        ]}
      />
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Delete Tweet?"
        className="max-w-xs"
      >
        <p className="text-[15px] text-muted">
          This can’t be undone. The Tweet will be removed from your profile,
          timelines and search results, together with its replies and likes.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-col gap-3">
          <Button
            size="lg"
            className="bg-red-600 text-white hover:bg-red-700"
            disabled={deleting}
            onClick={confirmDelete}
          >
            {deleting ? "Deleting…" : "Delete"}
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => setConfirming(false)}
          >
            Cancel
          </Button>
        </div>
      </Dialog>
    </>
  );
}
