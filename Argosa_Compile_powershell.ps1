dotnet publish "C:\ProgramData\Argosa\Argosa.csproj" `
>>   -c Release -r win-x64 `
>>   -p:PublishSingleFile=true -p:PublishTrimmed=true `
>>   --self-contained true