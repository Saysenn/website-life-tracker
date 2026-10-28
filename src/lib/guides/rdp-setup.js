export const rdpSetup = {
  slug: "rdp-setup",
  title: "Setting up an RDP",
  summary: "Prepare sign-up details, open a TryRDP account and order a UK RDP server.",
  icon: "server",
  phases: [
    {
      title: "Prepare the sign-up details",
      steps: [
        {
          title: "Get an email address",
          body: "Create a temporary mailbox. Keep the tab open, the TryRDP verification email lands here.",
          link: "https://temporarymail.com/",
        },
        {
          title: "Get an address",
          body: "Generate a UK address for the billing details.",
          link: "https://www.fakeaddressgenerator.com",
        },
        {
          title: "Get a phone number",
          body: "Generate a UK phone number for the account.",
          link: "https://randommer.io/Phone",
        },
        {
          title: "Get a name",
          body: "Generate a first and last name to register with.",
          link: "https://www.fakexy.com/",
        },
      ],
    },
    {
      title: "Create the TryRDP account",
      steps: [
        {
          title: "Register",
          body: "Fill in the sign-up form with the details from the steps above.",
          link: "https://my.tryrdp.com/register.php",
        },
        {
          title: "Log in",
          body: "Sign in to TryRDP with the email and password you just registered.",
          link: "https://my.tryrdp.com/",
        },
      ],
    },
    {
      title: "Order the server",
      steps: [
        {
          title: "Open the UK RDP plans",
          body: "From the TryRDP dashboard, open this menu path.",
          path: ["Services", "Order New Services", "UK RDP"],
        },
        {
          title: "Pick the plan",
          body: "Select UK PRO RDP, or a stronger plan if the company needs more power.",
        },
        {
          title: "Pay",
          body: "Proceed to checkout and complete the payment.",
        },
      ],
    },
  ],
  tip: "Once the server is ready, save the provider email, provider password, RDP key, server IP and username on the company in the tracker.",
};
