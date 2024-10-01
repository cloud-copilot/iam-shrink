# Shrink IAM Actions

Built in the Unix philosophy, this is a small tool with two goals:
1. Shrink IAM actions lists by creating patterns that match only the actions specified and no others.
2. Do #1 in a way that won't make your coworkers hate you.

Using Action Wildcards is not recommended, sometimes there are [IAM Limits](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_iam-quotas.html) you can't get around. This tool helps you stay within those limits.

## Getting Small While Staying Sane
IAM Actions are camel cased into a number of words. For example:
* `s3:GetObject` -> "Get" "Object"
* `s3:GetObjectTagging` -> "Get" "Object" "Tagging"

IAM Shrink will only replace one word at a time and will never replace part of a word. So for instance `s3:GetObject` will never get shrunk to something like `s3:*et*`. This is to balance size reduction with readability.

## Use in Browser
[https://iam.cloudcopilot.io/tools/iam-shrink](https://iam.cloudcopilot.io/tools/iam-shrink)

## Use in CLI

### Installation
You can install it globally. This also works in the default AWS CloudShell!
```bash
npm install -g @cloud-copilot/iam-shrink
```
*Depending on your configuration sudo may be required to install globally.*

### Help

```bash
iam-shrink --help
```

### Shrink IAM Actions

#### Pass in Argument
It's unlikely that you will pass in on the CLI a number of actions after the command name, but you can. You'll need a large number of actions for it to be pracitical, so it's mostly for automation.

```bash
Usage: iam-shrink s3:GetBucketTagging s3:GetJobTagging s3:GetObjectTagging s3:GetObjectVersionTagging s3:GetStorageLensConfigurationTagging
# Output
s3:Get*Tagging
```

#### Read from stdin
If no actions are passed as arguments, the CLI will read from stdin.

```bash
cat "s3:GetBucketTagging s3:GetJobTagging s3:GetObjectTagging s3:GetObjectVersionTagging s3:GetStorageLensConfigurationTagging" | iam-shrink
# Output
s3:Get*Tagging
```

#### Shrink JSON input
If the input is a valid json document, the CLI will find every instance of `Action` and `NotAction` that is an array of strings and shrink them.

Given `policy.json`
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "groundstation:GetAgentConfiguration",
        "groundstation:GetConfig",
        "groundstation:GetDataflowEndpointGroup",
        "groundstation:GetMinuteUsage",
        "groundstation:GetMissionProfile",
        "groundstation:GetSatellite",
        "groundstation:ListConfigs",
        "groundstation:ListContacts",
        "groundstation:ListDataflowEndpointGroups",
        "groundstation:ListEphemerides",
        "groundstation:ListGroundStations",
        "groundstation:ListMissionProfiles",
        "groundstation:ListSatellites",
        "groundstation:ListTagsForResource",
        "s3:GetBucketTagging",
        "s3:GetJobTagging",
        "s3:GetObjectTagging",
        "s3:GetObjectVersionTagging",
        "s3:GetStorageLensConfigurationTagging"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Deny",
      "NotAction": [
        "organizations:DeleteOrganization",
        "organizations:DeleteOrganizationalUnit",
        "organizations:DeletePolicy",
        "organizations:DeleteResourcePolicy",
        "organizations:LeaveOrganization"
      ],
      "Resource": "*"
    }
  ]
}
```

```bash
cat policy.json | iam-shrink > smaller-policy.json
```

Gives this file in `smaller-policy.json`
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "groundstation:List*",
        "groundstation:Get*",
        "s3:Get*Tagging"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Deny",
      "NotAction": [
        "organizations:Delete*",
        "organizations:Leave*"
      ],
      "Resource": "*"
    }
  ]
}
```

### Configuring iterations
By default, the CLI will do two iterations of shrinking. This generally does a good balance between reducing size and maintaining readability. This can be adjusted with the `--iterations` flag.

Assuming the [AWS Read Only policy](https://docs.aws.amazon.com/aws-managed-policy/latest/reference/ReadOnlyAccess.html) is in `readonly.json`

```bash
You can change this with the `--iterations` flag.

```bash
# Default two iterations
cat readonly.json | iam-shrink | wc -m
# 61305 characters

# Increasing iterations
cat readonly.json | iam-shrink --iterations=3 | wc -m
# 45983 characters
cat readonly.json | iam-shrink --iterations=4 | wc -m
# 43654 characters
cat readonly.json | iam-shrink --iterations=5 | wc -m
# 43336 characters

# Unlimited iterations until the policy cannot be further reduced
cat readonly.json | iam-shrink --iterations=0 | wc -m
# 43281 characters
```

If you want to shrink the policy as much as possible, you can use `--iterations=0`. This will keep shrinking the policy until it can't be reduced any further.

## Use in TypeScript/Node

You can use the shrink function in your own code.
```typescript
import { shrink } from '@cloud-copilot/iam-shrink';

const actions = [
  "s3:GetBucketTagging",
  "s3:GetJobTagging",
  "s3:GetObjectTagging",
  "s3:GetObjectVersionTagging",
  "s3:GetStorageLensConfigurationTagging"
];

const shrunk = await shrink(actions);
console.log(shrunk);
// [ s3:Get*Tagging ]
```

You can specify the number of iterations as well.
```typescript
import { shrink } from '@cloud-copilot/iam-shrink';

const bigListOfActions = getBigListOfActions();

const smallerList = await shrink(bigListOfActions, { iterations: 3 });
console.log(shrunk);
```