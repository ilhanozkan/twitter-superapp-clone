import { IUser } from "../../../types/User";

// Accounts the SuperApp world adds: three businesses, four drivers and the
// demo customer that simulated orders come from. All are fictional.

const person = (
  username: string,
  fullname: string,
  bio: string,
  joinedAt: string
): IUser => ({
  username,
  fullname,
  image: `/avatars/${username}.svg`,
  banner: null,
  bio,
  location: "Ankara",
  website: null,
  verified: false,
  joinedAt,
  accountType: "personal",
});

const business = (
  username: string,
  fullname: string,
  bio: string,
  joinedAt: string
): IUser => ({
  ...person(username, fullname, bio, joinedAt),
  banner: `/media/banner-${username}.svg`,
  accountType: "business",
});

export const superappUsers: IUser[] = [
  business(
    "kizilaykahve",
    "Kızılay Kahve",
    "Turkish coffee, pistachio lattes and fresh simit in the heart of Kızılay ☕ Open around the clock.",
    "2023-02-14T08:00:00.000Z"
  ),
  business(
    "lahmacunlab",
    "Lahmacun Lab",
    "Thin, crispy lahmacun and Anatolian classics in Ulus, until late.",
    "2023-06-01T11:00:00.000Z"
  ),
  business(
    "bowlandco",
    "Bowl & Co",
    "Fresh bowls, salads and lemonade on Tunalı Hilmi 🥗",
    "2024-04-22T09:00:00.000Z"
  ),
  person(
    "ahmet_drives",
    "Ahmet Kaya",
    "Driving around Ankara on SuperApp Rides 🚗",
    "2018-05-10T07:30:00.000Z"
  ),
  person(
    "elif_rides",
    "Elif Şahin",
    "Economy rides across the city. Podcasts on request.",
    "2020-09-18T10:00:00.000Z"
  ),
  person(
    "canwheels",
    "Can Öztürk",
    "Comfort rides, quiet cabin, always on time.",
    "2019-12-03T16:45:00.000Z"
  ),
  person(
    "zeynep_xl",
    "Zeynep Arslan",
    "XL rides for groups and airport runs ✈️",
    "2021-07-07T06:15:00.000Z"
  ),
  person(
    "demo_customer",
    "Demo Customer (bot)",
    "A simulated customer for business demos · Demo bot",
    "2026-01-01T00:00:00.000Z"
  ),
];
