# AWS Deployment Guide — Niubi E-Commerce Website

**Course:** UCCD 2083 — Cloud Computing and Services (Feb 2026)  
**Website:** Niubi — Premium Tech & Lifestyle Store  
**File Structure:** Multi-page site with 6 HTML pages, CSS, JS modules, and JSON data

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [AWS Services Used](#2-aws-services-used)
3. [Prerequisites](#3-prerequisites)
4. [Step 1 — Create a VPC](#step-1--create-a-vpc-virtual-private-cloud)
5. [Step 2 — Configure Security Groups](#step-2--configure-security-groups)
6. [Step 3 — Launch an EC2 Instance](#step-3--launch-an-ec2-instance)
7. [Step 4 — Connect to EC2 & Install Web Server](#step-4--connect-to-ec2--install-web-server)
8. [Step 5 — Upload & Deploy the Website](#step-5--upload--deploy-the-website)
9. [Step 6 — Set Up S3 for Static Assets](#step-6--set-up-s3-for-static-asset-storage)
10. [Step 7 — Set Up RDS (Database)](#step-7--set-up-rds-database)
11. [Step 8 — Set Up CloudFront CDN](#step-8--set-up-cloudfront-cdn)
12. [Step 9 — Verify Everything Works](#step-9--verify-everything-works)
13. [After Deployment — What to Do Next](#after-deployment--what-to-do-next)
14. [Cleanup (Avoid AWS Charges)](#cleanup-avoid-aws-charges)

---

## 1. Architecture Overview

The architecture deploys Niubi inside a **VPC** with public and private subnets, an **EC2** web server running Nginx, an **S3** bucket for static images and data, an **RDS** MySQL database in a private subnet, **Security Groups** as firewalls, and **CloudFront** as a CDN.

### Architecture Diagram

```
                           ┌───────────────────┐
                           │    End Users       │
                           │  (Web Browsers)    │
                           └────────┬──────────┘
                                    │
                                    ▼
                           ┌───────────────────┐
                           │  CloudFront CDN    │
                           │  (Edge Caching)    │
                           └────────┬──────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────┐
│                     VPC (10.0.0.0/16)                             │
│                                                                   │
│  ┌─────────────────────────────┐  ┌────────────────────────────┐  │
│  │  Public Subnet              │  │  Private Subnet             │  │
│  │  10.0.1.0/24                │  │  10.0.2.0/24                │  │
│  │                             │  │                              │  │
│  │  ┌───────────────────────┐  │  │  ┌────────────────────────┐ │  │
│  │  │  EC2 Instance         │  │  │  │  RDS MySQL Database    │ │  │
│  │  │  (Nginx Web Server)   │──│──│──│  (niubi-db)            │ │  │
│  │  │  Amazon Linux 2023    │  │  │  │  Port 3306             │ │  │
│  │  │  t2.micro             │  │  │  │  db.t3.micro           │ │  │
│  │  └───────────────────────┘  │  │  └────────────────────────┘ │  │
│  │                             │  │                              │  │
│  │  Security Group:            │  │  Security Group:             │  │
│  │  - SSH (22) from My IP      │  │  - MySQL (3306) from WebSG  │  │
│  │  - HTTP (80) from anywhere  │  │                              │  │
│  │  - HTTPS (443) from anywhere│  │                              │  │
│  └─────────────────────────────┘  └────────────────────────────┘  │
│                                                                   │
│  Internet Gateway ← → Route Table ← → Public Subnet              │
└───────────────────────────────────────────────────────────────────┘

                           ┌───────────────────┐
                           │  S3 Bucket         │
                           │  (Static Assets)   │
                           │  products.json     │
                           │  product images    │
                           └───────────────────┘
```

### Data Flow

1. **User** opens the website URL in their browser.
2. **CloudFront** checks if a cached copy exists at the nearest edge location. If yes, it serves the cached content (fast). If not, it forwards the request to the origin.
3. The request reaches the **EC2 instance** (Nginx) inside the **public subnet** of the **VPC**.
4. Nginx serves the HTML pages. Product images and data are loaded from the **S3 bucket** via CloudFront.
5. When the contact form or newsletter signup is submitted, the EC2 instance processes the request and writes the data to **RDS MySQL** in the **private subnet** via port 3306.
6. **Security Groups** act as firewalls at every layer, controlling exactly which traffic is allowed in and out.

---

## 2. AWS Services Used

| #  | AWS Service           | Purpose                                  | Assignment Concern Addressed |
|----|-----------------------|------------------------------------------|------------------------------|
| 1  | **VPC**               | Isolated virtual network with subnets    | Security                     |
| 2  | **EC2**               | Virtual server running Nginx web server  | Core Hosting                 |
| 3  | **Security Groups**   | Firewall rules for inbound/outbound      | Security                     |
| 4  | **S3**                | Static asset storage (images, data)      | Storage / Cost Efficiency    |
| 5  | **RDS**               | Managed MySQL database (private subnet)  | Security / Reliability       |
| 6  | **CloudFront**        | CDN for fast global content delivery     | Performance                  |

> **Note:** The assignment requires at least 3 AWS services. This guide uses **6 services** to demonstrate a well-rounded cloud architecture addressing Security, Performance, and Reliability.

---

## 3. Prerequisites

Before starting, ensure you have the following:

- An **AWS Account** (AWS Academy or personal)
- A **key pair** (.pem file) — you will create or select one during EC2 setup
- An **SSH client** — Terminal (Mac/Linux) or **PuTTY** / **Windows Terminal** (Windows)
- The Niubi website files on your local machine:
  ```
  ecommerce-site/
  ├── index.html
  ├── shop.html
  ├── product.html
  ├── seasonal.html
  ├── about.html
  ├── contact.html
  ├── css/style.css
  ├── js/script.js
  ├── js/cart.js
  ├── js/products.js
  ├── js/shop.js
  ├── js/seasonal.js
  ├── data/products.json
  └── images/hero.png
  ```

---

## Step 1 — Create a VPC (Virtual Private Cloud)

1. Go to **AWS Console → VPC → Create VPC**
2. Choose **VPC and more** (this creates subnets and route tables automatically)
3. Settings:
   - **Name:** `niubi-vpc`
   - **IPv4 CIDR:** `10.0.0.0/16`
   - **Number of Availability Zones:** `1` (sufficient for learning)
   - **Public subnets:** `1` (CIDR: `10.0.1.0/24`)
   - **Private subnets:** `1` (CIDR: `10.0.2.0/24`)
   - **NAT gateway:** `None` (to save costs)
   - **VPC Endpoints:** `None`
4. Click **Create VPC**

> **What this does:** Creates an isolated network. The public subnet has internet access (where EC2 goes). The private subnet has no direct internet access (where RDS goes for security).

---

## Step 2 — Configure Security Groups

### Web Server Security Group

1. Go to **VPC → Security Groups → Create Security Group**
2. Settings:
   - **Name:** `niubi-web-sg`
   - **Description:** Security group for Niubi web server
   - **VPC:** Select `niubi-vpc`
3. **Inbound Rules:**

   | Type  | Port | Source        | Purpose                    |
   |-------|------|---------------|----------------------------|
   | SSH   | 22   | My IP         | Remote access to server    |
   | HTTP  | 80   | 0.0.0.0/0     | Website traffic            |
   | HTTPS | 443  | 0.0.0.0/0     | Secure website traffic     |

4. **Outbound Rules:** Leave as default (All traffic, 0.0.0.0/0)
5. Click **Create Security Group**

### Database Security Group

1. Create another security group:
   - **Name:** `niubi-db-sg`
   - **Description:** Security group for Niubi database
   - **VPC:** Select `niubi-vpc`
2. **Inbound Rules:**

   | Type   | Port | Source          | Purpose                    |
   |--------|------|-----------------|----------------------------|
   | MySQL  | 3306 | niubi-web-sg    | Allow EC2 to access DB     |

3. Click **Create Security Group**

> **Why separate groups?** The database only accepts connections from the web server — never from the internet. This is a core cloud security principle.

---

## Step 3 — Launch an EC2 Instance

1. Go to **EC2 → Launch Instance**
2. Settings:
   - **Name:** `niubi-web-server`
   - **AMI:** Amazon Linux 2023 (Free tier eligible)
   - **Instance type:** `t2.micro` (Free tier)
   - **Key pair:** Select or create a key pair. **Download the .pem file and save it safely**
   - **Network settings → Edit:**
     - **VPC:** `niubi-vpc`
     - **Subnet:** Select the **public** subnet
     - **Auto-assign Public IP:** `Enable`
     - **Security Group:** Select `niubi-web-sg`
3. Click **Launch Instance**
4. Note down the **Public IP** once it's running

---

## Step 4 — Connect to EC2 & Install Web Server

### Connect via SSH

**Windows (PowerShell):**
```powershell
# Restrict key permissions (Windows equivalent of chmod 400)
icacls .\niubi-keypair.pem /inheritance:r /grant:r "$($env:USERNAME):(R)"

# Connect to EC2
ssh -i .\niubi-keypair.pem ec2-user@YOUR_EC2_PUBLIC_IP
```

**Mac/Linux:**
```bash
chmod 400 niubi-keypair.pem
ssh -i niubi-keypair.pem ec2-user@YOUR_EC2_PUBLIC_IP
```

### Install Nginx

```bash
sudo dnf update -y
sudo dnf install nginx -y
sudo systemctl start nginx
sudo systemctl enable nginx
```

### Verify Nginx is running

Open `http://YOUR_EC2_PUBLIC_IP` in your browser. You should see the Nginx welcome page.

---

## Step 5 — Upload & Deploy the Website

### Upload files from your local machine

Open a **new** terminal on your local machine (keep the SSH session open):

```bash
# Upload all website files to EC2
scp -i your-key.pem -r css js data images index.html shop.html product.html seasonal.html about.html contact.html ec2-user@YOUR_EC2_PUBLIC_IP:/tmp/niubi-site/
```

### On the EC2 instance (SSH session):

```bash
# Move files to Nginx's web directory
sudo rm -rf /usr/share/nginx/html/*
sudo cp -r /tmp/niubi-site/* /usr/share/nginx/html/
sudo chown -R nginx:nginx /usr/share/nginx/html/
```

### Verify

Open `http://YOUR_EC2_PUBLIC_IP` — your Niubi website should load!

---

## Step 6 — Set Up S3 for Static Asset Storage

1. Go to **S3 → Create Bucket**
2. Settings:
   - **Bucket name:** `niubi-assets-YOURID` (must be globally unique — add your student ID)
   - **Region:** Same region as your EC2
   - **Uncheck** "Block all public access" (we need public read for images)
   - Acknowledge the warning
3. Click **Create Bucket**

### Upload Product Images

1. Open the bucket → click **Upload**
2. Create a folder `images/` and upload `hero.png`
3. Create a folder `data/` and upload `products.json`

### Set Bucket Policy (Public Read)

Go to **Permissions → Bucket Policy** and paste:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::niubi-assets-YOURID/*"
        }
    ]
}
```

> Replace `niubi-assets-YOURID` with your actual bucket name.

### Get the S3 URL

Your assets are now accessible at: `https://niubi-assets-YOURID.s3.REGION.amazonaws.com/images/hero.png`

---

## Step 7 — Set Up RDS (Database)

1. Go to **RDS → Create Database**
2. Settings:
   - **Creation method:** Standard create
   - **Engine:** MySQL
   - **Templates:** Free Tier
   - **DB instance identifier:** `niubi-db`
   - **Master username:** `admin`
   - **Master password:** Choose and save a strong password
   - **Instance class:** `db.t3.micro`
   - **Storage:** 20 GB gp2
3. **Connectivity:**
   - **VPC:** `niubi-vpc`
   - **Subnet group:** Create new (select both subnets)
   - **Public access:** `No` ← important for security
   - **Security Group:** Select `niubi-db-sg`
4. Click **Create Database** (takes 5-10 minutes)

### Create the Database Tables

Once the RDS instance is ready, connect from your EC2 instance:

```bash
# Install MySQL client on EC2
sudo dnf install mariadb105 -y

# Connect to RDS (use your RDS endpoint from the AWS console)
mysql -h YOUR_RDS_ENDPOINT -u admin -p
```

Then run:

```sql
CREATE DATABASE niubi;
USE niubi;

CREATE TABLE contact_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    order_number VARCHAR(50),
    message TEXT NOT NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE newsletter_subscribers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Verify
SHOW TABLES;
```

---

## Step 8 — Set Up CloudFront CDN

1. Go to **CloudFront → Create Distribution**
2. Settings:
   - **Origin domain:** Your EC2 public IP or the S3 bucket
   - **Viewer protocol policy:** Redirect HTTP to HTTPS
   - **Cache behavior:** Use recommended settings
   - **Price class:** Use only North America and Europe (for lower costs)
3. Click **Create Distribution** (takes 5-15 minutes to deploy)
4. Note the **CloudFront domain** (e.g., `d1234abcdef.cloudfront.net`)

---

## Step 9 — Verify Everything Works

| Check | How to Verify |
|-------|---------------|
| EC2 serves the site | Open `http://YOUR_EC2_PUBLIC_IP` |
| All pages work | Click through Home, Shop, Seasonal, About, Contact |
| Cart works | Add product to cart, check sidebar opens |
| S3 serves assets | Open your S3 image URL directly |
| CloudFront CDN | Open `https://YOUR_CLOUDFRONT.cloudfront.net` |
| RDS is accessible from EC2 | Run `mysql -h RDS_ENDPOINT -u admin -p` from EC2 |

---

## After Deployment — What to Do Next

Once your site is live on AWS and all 6 services are set up, you have two more integration steps to complete. **Come back and ask me to help with each one:**

### Phase 2: Wire Contact Form → RDS (EC2 Backend)

I will create a lightweight backend script (Python Flask) on your EC2 instance that:
- Receives contact form POST requests from `contact.html`
- Inserts the data into the `contact_messages` table in RDS
- Returns a success/failure JSON response

**This demonstrates:** EC2 ↔ RDS communication in the private subnet

**What you'll need to tell me:**
- Your RDS endpoint (from the RDS console)
- Your RDS master password
- Confirm EC2 is running and SSH is accessible

### Phase 3: Point Images to S3 + CloudFront

I will update your `products.js` and HTML files to:
- Load product images from your S3 bucket URL (or CloudFront URL)
- Load `products.json` from S3/CloudFront instead of local files

**This demonstrates:** S3 static asset hosting + CloudFront CDN delivery

**What you'll need to tell me:**
- Your S3 bucket name
- Your CloudFront distribution URL

### After Both Phases

Your final architecture will have **all 6 AWS services actively working together:**

```
User → CloudFront (CDN) → EC2 (Nginx + Flask backend)
                              ↕
                          RDS MySQL (private subnet)
       CloudFront → S3 (product images & data)
       All within VPC with Security Groups
```

---

## Cleanup (Avoid AWS Charges)

When you're done with the assignment, terminate/delete these resources:

1. **EC2:** Instances → Select → Instance State → Terminate
2. **RDS:** Databases → Select → Actions → Delete (uncheck final snapshot to skip)
3. **S3:** Empty the bucket first → then Delete bucket
4. **CloudFront:** Disable the distribution → then Delete
5. **VPC:** Delete the VPC (this removes subnets, route tables, and internet gateway)

> ⚠️ **Important:** If you're on AWS Academy, resources may auto-terminate. If on a personal account, always clean up to avoid charges.

---

## Tips for Your Report

1. **Screenshot every step** — VPC creation, Security Group rules, EC2 running, RDS endpoint, S3 bucket, CloudFront distribution
2. **Show the architecture diagram** — Include the ASCII diagram above in your report
3. **Show the data flow** — A contact form submission going from browser → EC2 → RDS proves the architecture works
4. **Highlight security** — Private subnet for RDS, Security Groups limiting access = strong cloud security practice
5. **Mention 6 services** — VPC, EC2, Security Groups, S3, RDS, CloudFront — this exceeds the minimum 3
