import json

def update_realm(file_path, new_users_data):
    with open(file_path, 'r') as f:
        data = json.load(f)
    
    users = []
    for user in new_users_data:
        u = {
            "username": user["username"],
            "enabled": True,
            "emailVerified": True,
            "email": user["email"],
            "firstName": user.get("firstName", ""),
            "lastName": user.get("lastName", ""),
            "credentials": [
                {
                    "type": "password",
                    "value": user["password"],
                    "temporary": False
                }
            ],
            "realmRoles": [
                "default-roles-workspace"
            ]
        }
        if user.get("admin", False):
            u["clientRoles"] = {
                "realm-management": [
                    "realm-admin"
                ]
            }
        users.append(u)
    
    data["users"] = users
    
    with open(file_path, 'w') as f:
        json.dump(data, f, indent=2)


mentolder_users = [
    {
        "username": "quamain",
        "email": "quamain@web.de",
        "password": "170591pk!Gekko",
        "firstName": "Quamain",
        "lastName": "User",
        "admin": True
    },
    {
        "username": "paddione",
        "email": "patrick@korczewski.de",
        "password": "170591pk!Gekko",
        "firstName": "Patrick",
        "lastName": "Korczewski",
        "admin": True
    }
]

update_realm("prod/realm-workspace-prod.json", mentolder_users)

korczewski_users = [
    {
        "username": "Christina.Wolf",
        "email": "tina-merlin@web.de",
        "password": "170591pk!Tina",
        "firstName": "Christina",
        "lastName": "Wolf"
    },
    {
        "username": "Martina.Semmler",
        "email": "martina.semmler@outlook.com",
        "password": "170591pk!Martina",
        "firstName": "Martina",
        "lastName": "Semmler"
    },
    {
        "username": "Oskar.Berger",
        "email": "oskarberger@gmx.com",
        "password": "170591pk!Oskar",
        "firstName": "Oskar",
        "lastName": "Berger"
    },
    {
        "username": "paddione",
        "email": "patrick@korczewski.de",
        "password": "170591pk!Gekko",
        "firstName": "Patrick",
        "lastName": "Korczewski",
        "admin": True
    }
]

update_realm("prod-korczewski/realm-workspace-korczewski.json", korczewski_users)
